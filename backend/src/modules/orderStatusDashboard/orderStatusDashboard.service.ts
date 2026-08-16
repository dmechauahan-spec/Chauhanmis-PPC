import { OrderStatus } from '@prisma/client';
import { prisma } from '../../db/client';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { getQcInspectionSummary } from '../qcInspection/qcInspection.service';
import { getCompletionForecast, getCumulativePlannedQtyToDate } from '../productionPlan/productionPlan.service';
import { ListOrderStatusDashboardQuery } from './orderStatusDashboard.schema';
import { deriveStatusBadge, StatusBadge } from './statusBadge';

// Client Flow Part 5 — the Unified Order Status Dashboard. A pure
// COMPOSITION layer, like Module 14's dashboard: every number here is read
// or reused from an existing module/part, never independently recomputed.
// See README "Client Flow Part 5" for the full list of what's called into
// and why (and the one deliberate performance tradeoff: reusing Parts 1-4's
// own functions per row, rather than hand-writing one mega-query, costs
// several extra round trips per row in exchange for zero duplicated
// business logic and zero risk of drifting out of sync with those parts'
// own canonical calculations).

export interface OrderStatusDashboardRow {
  orderId: string;
  client: string;
  sku: string;
  product: string;
  qty: number;
  priority: string;
  dueDate: Date | null;
  status: OrderStatus;
  line: { lineId: string; lineName: string | null } | null;
  machines: string[];
  /** Cumulative planned qty THROUGH TODAY (Part 2's getCumulativePlannedQtyToDate) — null if no plan exists yet. */
  plan: number | null;
  /** Cumulative actual production to date — sum of daily_production_log.totalOutputQty for this order. */
  actual: number;
  qc: { passedQty: number; rejectedQty: number; reworkQty: number };
  /** order.qty - qc.passedQty — taken directly from Part 4A's forecast.balanceQty, never recomputed independently. */
  balanceQty: number;
  expectedCompletionDate: Date | null;
  statusBadge: StatusBadge;
}

async function buildDashboardRow(order: {
  orderId: string;
  client: string;
  sku: string;
  product: string;
  qty: number;
  priority: string;
  dueDate: Date | null;
  status: OrderStatus;
}): Promise<OrderStatusDashboardRow> {
  const [schedule, actualAgg, qcSummary, forecast, plan, qcInspectionCount] = await Promise.all([
    // line — from Module 10's schedule, if the order has been scheduled.
    prisma.productionSchedule.findUnique({ where: { orderId: order.orderId } }),
    // actual — direct sum, same read the closure-summary hook (orders.service.ts) performs for
    // the same figure; not exposed as a reusable function there (it's a private helper on a
    // different transition path), so this is a fresh, equally-trivial read, not duplicated
    // business logic.
    prisma.dailyProductionLog.aggregate({ where: { orderId: order.orderId }, _sum: { totalOutputQty: true } }),
    // qc — Part 3's cumulative summary, reused as-is.
    getQcInspectionSummary(order.orderId),
    // balanceQty / expectedCompletionDate / isDelayedByForecast — Part 4A's forecast, reused as-is.
    getCompletionForecast(order.orderId),
    // plan (to date) — Part 2's dedicated to-date figure (see productionPlan.service.ts).
    getCumulativePlannedQtyToDate(order.orderId),
    // hasQcInspectionRecorded — a COUNT, not a quantity-sum proxy: see statusBadge.ts and README
    // for why "QC Pending" is defined this precisely rather than via a rejection-rate threshold.
    prisma.dailyQcInspection.count({ where: { orderId: order.orderId } }),
  ]);

  const actual = Number(actualAgg._sum.totalOutputQty ?? 0);
  const hasProductionLogged = actual > 0;

  const statusBadge = deriveStatusBadge({
    orderStatus: order.status,
    isDelayedByForecast: forecast.isDelayedByForecast,
    scheduleStatus: schedule?.status ?? null,
    hasProductionLogged,
    hasQcInspectionRecorded: qcInspectionCount > 0,
  });

  return {
    orderId: order.orderId,
    client: order.client,
    sku: order.sku,
    product: order.product,
    qty: order.qty,
    priority: order.priority,
    dueDate: order.dueDate,
    status: order.status,
    line: schedule?.lineId ? { lineId: schedule.lineId, lineName: schedule.lineName } : null,
    // machines — deliberately always []. daily_production_log has no
    // machineId column: Part 1's actual scope added orderId/rejectedQty/
    // reworkQty to it, not a per-log machine assignment (Part 1's Machine
    // master-data table exists, but nothing links a daily log row to a
    // specific Machine yet — the same "machine-level assignment isn't
    // built" limitation Part 2's daily_production_plan.machineId already
    // documents). Returning [] here is the honest answer, not a bug — see
    // README "Client Flow Part 5".
    machines: [] as string[],
    plan,
    actual,
    qc: { passedQty: qcSummary.totalPassedQty, rejectedQty: qcSummary.totalRejectedQty, reworkQty: qcSummary.totalReworkQty },
    balanceQty: forecast.balanceQty,
    expectedCompletionDate: forecast.expectedCompletionDate,
    statusBadge,
  };
}

export async function listOrderStatusDashboard(
  query: ListOrderStatusDashboardQuery,
): Promise<PaginatedResult<OrderStatusDashboardRow>> {
  const where = { status: { not: OrderStatus.Closed } };
  const { skip, take } = toSkipTake(query);

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.order.count({ where }),
  ]);

  const items = await Promise.all(orders.map((order) => buildDashboardRow(order)));

  return buildPaginated(items, total, query.page, query.pageSize);
}
