import { OrderStatus, PrStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { getOeeSummary } from '../oee/oee.service';
import { OeeAggregateResult } from '../oee/oeeCalculator';
import { getMaterialsSummary } from '../materials/materials.service';
import { CtbBreakdown, getCtbBreakdown } from '../ctb/ctb.service';
import { getPrStatusBreakdown } from '../purchaseRequisitions/purchaseRequisitions.service';
import { getRiskSummary } from '../risk/risk.service';
import { Completion, LineOutput, OnTimeRateResult, calculateOnTimeRate, calculateWeightedEfficiency } from './dashboardMath';
import { ManagementQuery, OverviewQuery, ProductionQuery } from './dashboard.schema';

// ----------------------------------------------------------------------------
// Endpoint #1: GET /api/dashboard/production — output over time
// ----------------------------------------------------------------------------

const PERIOD_TO_POSTGRES_UNIT: Record<ProductionQuery['period'], string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

export interface ProductionPeriodRow {
  periodLabel: Date;
  totalOutputQty: number;
  totalGoodQty: number;
  avgAttendancePct: number | null;
}

interface RawProductionRow {
  periodLabel: Date;
  totalOutputQty: Prisma.Decimal | null;
  totalGoodQty: Prisma.Decimal | null;
  avgAttendancePct: Prisma.Decimal | null;
}

export async function getProductionOverTime(query: ProductionQuery): Promise<ProductionPeriodRow[]> {
  const unit = PERIOD_TO_POSTGRES_UNIT[query.period];

  const rows = await prisma.$queryRaw<RawProductionRow[]>(Prisma.sql`
    SELECT
      date_trunc(${unit}, log_date) AS "periodLabel",
      SUM(total_output_qty) AS "totalOutputQty",
      SUM(good_qty) AS "totalGoodQty",
      AVG(attendance_pct) AS "avgAttendancePct"
    FROM daily_production_log
    WHERE log_date BETWEEN ${new Date(query.dateFrom)} AND ${new Date(query.dateTo)}
    GROUP BY "periodLabel"
    ORDER BY "periodLabel" ASC
  `);

  return rows.map((r) => ({
    periodLabel: r.periodLabel,
    totalOutputQty: r.totalOutputQty == null ? 0 : Number(r.totalOutputQty),
    totalGoodQty: r.totalGoodQty == null ? 0 : Number(r.totalGoodQty),
    avgAttendancePct: r.avgAttendancePct == null ? null : Number(r.avgAttendancePct),
  }));
}

// ----------------------------------------------------------------------------
// Endpoint #2: GET /api/dashboard/planning — scheduling health
// ----------------------------------------------------------------------------

export interface PlanningHealth {
  scheduledCount: number;
  delayedCount: number;
  atRiskCount: number;
}

// At Risk is Module 10/11's existing, forward-looking projection based on
// slack — reused directly via Module 11's getRiskSummary(), never
// recomputed here. Delayed is a lagging indicator computed fresh: orders
// whose OWN dueDate (the commitment made to the client — chosen over
// production_schedule.estEndDate so unscheduled orders can be "overdue"
// too, not just scheduled ones) has already passed while the order still
// hasn't reached Dispatch Ready or Closed. These are deliberately two
// different queries against two different signals — see README "Module 14".
export async function getPlanningHealth(): Promise<PlanningHealth> {
  const [scheduledCount, delayedCount, riskSummary] = await Promise.all([
    prisma.order.count({
      where: { status: { in: [OrderStatus.Scheduled, OrderStatus.Running] }, schedules: { some: {} } },
    }),
    prisma.order.count({
      where: {
        dueDate: { lt: new Date() },
        status: { notIn: [OrderStatus.DispatchReady, OrderStatus.Closed] },
      },
    }),
    getRiskSummary(),
  ]);

  return { scheduledCount, delayedCount, atRiskCount: riskSummary.totalAtRisk };
}

// ----------------------------------------------------------------------------
// Endpoint #3: GET /api/dashboard/materials — material health
// ----------------------------------------------------------------------------

export interface MaterialsHealth {
  ctbBreakdown: CtbBreakdown;
  rmShortagePartsCount: number;
  procurementStatusBreakdown: Record<PrStatus, number>;
}

// Every figure here is composed from an existing module's own service
// function — Module 6's CTB breakdown, Module 7's shortage-parts count, and
// Module 9's PR status counts — none re-queried independently.
export async function getMaterialsHealth(): Promise<MaterialsHealth> {
  const [ctbBreakdown, materialsSummary, procurementStatusBreakdown] = await Promise.all([
    getCtbBreakdown(),
    getMaterialsSummary(),
    getPrStatusBreakdown(),
  ]);

  return {
    ctbBreakdown,
    rmShortagePartsCount: materialsSummary.totalShortagePartsCount,
    procurementStatusBreakdown,
  };
}

// ----------------------------------------------------------------------------
// Endpoint #4: GET /api/dashboard/management — the four metrics
// ----------------------------------------------------------------------------

export interface ManagementMetrics {
  oeePct: number | null;
  /** Exactly Module 4's performancePct for this range — same underlying number, different label. See README "Module 14". */
  capacityUtilizationPct: number | null;
  productionEfficiencyPct: number;
  deliveryPerformancePct: number;
  detail: {
    oee: OeeAggregateResult;
    productionEfficiency: { lineCount: number; lines: (LineOutput & { lineId: string; lineName: string })[] };
    deliveryPerformance: OnTimeRateResult;
  };
}

export async function getManagementMetrics(query: ManagementQuery): Promise<ManagementMetrics> {
  const dateFrom = new Date(query.dateFrom);
  const dateTo = new Date(query.dateTo);

  const [oeeSummary, lineOutputRows, deliveryRows] = await Promise.all([
    // Module 4's aggregate, called directly — never recomputed. Both oeePct
    // (OEE) and performancePct (Capacity Utilization) come from this one call.
    getOeeSummary({ dateFrom: query.dateFrom, dateTo: query.dateTo }),
    prisma.dailyProductionLog.groupBy({
      by: ['lineId'],
      where: { logDate: { gte: dateFrom, lte: dateTo }, lineId: { not: null } },
      _sum: { totalOutputQty: true },
    }),
    // Delivery Performance's source: each order's transition INTO Dispatch
    // Ready within the range (the "production done, ready to ship"
    // milestone). Closed necessarily comes after Dispatch Ready in Module
    // 2's linear flow, so every eventually-Closed order's completion is
    // already captured here — a separate Closed lookup would only ever
    // find the same orders again, never new ones. See README "Module 14".
    prisma.orderStatusHistory.findMany({
      where: { newStatus: OrderStatus.DispatchReady, changedAt: { gte: dateFrom, lte: dateTo } },
      select: { orderId: true, changedAt: true },
    }),
  ]);

  const lineIds = lineOutputRows.map((r) => r.lineId).filter((id): id is string => id != null);
  const lines = lineIds.length > 0 ? await prisma.productionLine.findMany({ where: { lineId: { in: lineIds } } }) : [];
  const lineById = new Map(lines.map((l) => [l.lineId, l]));

  const lineOutputs = lineOutputRows
    .filter((r) => r.lineId != null && lineById.has(r.lineId))
    .map((r) => {
      const line = lineById.get(r.lineId as string)!;
      return {
        lineId: line.lineId,
        lineName: line.lineName,
        efficiencyPct: Number(line.efficiencyPct),
        totalOutputQty: Number(r._sum.totalOutputQty ?? 0),
      };
    });

  const productionEfficiencyPct = calculateWeightedEfficiency(lineOutputs);

  const orderIds = deliveryRows.map((r) => r.orderId);
  const orders =
    orderIds.length > 0
      ? await prisma.order.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, dueDate: true } })
      : [];
  const dueDateByOrderId = new Map(orders.map((o) => [o.orderId, o.dueDate]));
  const completions: Completion[] = deliveryRows.map((r) => ({
    completedAt: r.changedAt,
    dueDate: dueDateByOrderId.get(r.orderId) ?? null,
  }));
  const deliveryPerformance = calculateOnTimeRate(completions);

  return {
    oeePct: oeeSummary.oeePct,
    capacityUtilizationPct: oeeSummary.performancePct,
    productionEfficiencyPct,
    deliveryPerformancePct: deliveryPerformance.rate,
    detail: {
      oee: oeeSummary,
      productionEfficiency: { lineCount: lineOutputs.length, lines: lineOutputs },
      deliveryPerformance,
    },
  };
}

// ----------------------------------------------------------------------------
// Endpoint #5: GET /api/dashboard/overview — everything at once
// ----------------------------------------------------------------------------

export interface DashboardOverview {
  production: ProductionPeriodRow[];
  planning: PlanningHealth;
  materials: MaterialsHealth;
  management: ManagementMetrics;
}

// Composes endpoints #1-#4's own service functions via Promise.all — no
// separate logic. Planning/materials ignore dateFrom/dateTo (current-state
// snapshots); production defaults to a 'daily' grouping for this
// single-call landing-page view (a judgment call — see README "Module 14").
export async function getDashboardOverview(query: OverviewQuery): Promise<DashboardOverview> {
  const [production, planning, materials, management] = await Promise.all([
    getProductionOverTime({ period: 'daily', dateFrom: query.dateFrom, dateTo: query.dateTo }),
    getPlanningHealth(),
    getMaterialsHealth(),
    getManagementMetrics({ dateFrom: query.dateFrom, dateTo: query.dateTo }),
  ]);

  return { production, planning, materials, management };
}
