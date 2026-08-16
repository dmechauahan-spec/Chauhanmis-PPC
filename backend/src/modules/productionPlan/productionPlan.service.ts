import { prisma } from '../../db/client';
import { AppError, BusinessRuleError, NotFoundError } from '../../utils/errors';
import { addDaysUTC, diffDaysUTC } from '../scheduling/schedulingEngine';
import { distributeDailyPlanQty } from './planDistributor';

async function getOrderOrThrow(orderId: string) {
  const order = await prisma.order.findUnique({ where: { orderId } });
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }
  return order;
}

export interface DailyProductionPlanRow {
  id: bigint;
  orderId: string;
  planDate: Date;
  lineId: string | null;
  machineId: string | null;
  plannedQty: number;
}

function toRow(row: {
  id: bigint;
  orderId: string;
  planDate: Date;
  lineId: string | null;
  machineId: string | null;
  plannedQty: unknown;
}): DailyProductionPlanRow {
  return {
    id: row.id,
    orderId: row.orderId,
    planDate: row.planDate,
    lineId: row.lineId,
    machineId: row.machineId,
    plannedQty: Number(row.plannedQty),
  };
}

// Endpoint #1: explicit generation, same "generate on demand, not a silent
// side effect of scheduling" convention as Module 9's PR generation and
// Module 13's QC batch generation — see README "Client Flow Part 2". Reads
// the order's existing production_schedule row (Module 10); if there isn't
// one yet (or it's missing the fields this needs), this fails clearly rather
// than guessing a plan from nothing.
export async function generateProductionPlan(orderId: string): Promise<DailyProductionPlanRow[]> {
  const order = await getOrderOrThrow(orderId);

  const schedule = await prisma.productionSchedule.findUnique({ where: { orderId } });
  if (!schedule) {
    throw new BusinessRuleError(
      `Order '${orderId}' has no production schedule yet. Run scheduling (POST /api/scheduling/run) before generating a production plan.`,
      { orderId },
      409,
    );
  }
  if (!schedule.startDate || !schedule.estEndDate || schedule.dailyOutput == null) {
    throw new BusinessRuleError(
      `Order '${orderId}'s production schedule is missing startDate/estEndDate/dailyOutput — cannot generate a day-by-day plan from it.`,
      { orderId, startDate: schedule.startDate, estEndDate: schedule.estEndDate, dailyOutput: schedule.dailyOutput },
      409,
    );
  }

  const numDays = diffDaysUTC(schedule.estEndDate, schedule.startDate) + 1;
  if (numDays < 1) {
    throw new BusinessRuleError(
      `Order '${orderId}'s schedule has an estEndDate before its startDate — cannot generate a plan.`,
      { orderId, startDate: schedule.startDate, estEndDate: schedule.estEndDate },
      409,
    );
  }

  const allocations = distributeDailyPlanQty(order.qty, Number(schedule.dailyOutput), numDays);
  const startDate = schedule.startDate;
  const lineId = schedule.lineId;

  const rows = allocations.map((plannedQty, index) => ({
    orderId,
    planDate: addDaysUTC(startDate, index),
    lineId,
    // Machine-level scheduling assignment isn't built yet (only per-Line) —
    // see README "Client Flow Part 2". Left null rather than guessed.
    machineId: null,
    plannedQty,
  }));

  const created = await prisma.$transaction(async (tx) => {
    // Force-recompute replaces the existing plan wholesale — same
    // delete-then-recreate-in-one-transaction pattern as Module 5's
    // recomputeOrderBomSnapshot.
    await tx.dailyProductionPlan.deleteMany({ where: { orderId } });
    await tx.dailyProductionPlan.createMany({ data: rows });
    return tx.dailyProductionPlan.findMany({ where: { orderId }, orderBy: { planDate: 'asc' } });
  });

  return created.map(toRow);
}

// Endpoint #2: 404 if nothing has been generated yet, pointing the caller at
// the generate endpoint — "not computed yet" is a distinguishable, expected
// state, not a silently-invented empty plan.
export async function getProductionPlan(orderId: string): Promise<DailyProductionPlanRow[]> {
  await getOrderOrThrow(orderId);

  const rows = await prisma.dailyProductionPlan.findMany({ where: { orderId }, orderBy: { planDate: 'asc' } });
  if (rows.length === 0) {
    throw new AppError(
      `No production plan exists yet for order '${orderId}'. Generate one via POST /api/production-plan/generate/${orderId}.`,
      404,
    );
  }
  return rows.map(toRow);
}

export interface PlanVsActualDay {
  date: Date;
  plannedQty: number;
  actualQty: number;
  gap: number;
  achievementPct: number | null;
  gapReasons: Array<{ reason: string; totalMinutes: number }>;
  noDataLogged: boolean;
}

export interface PlanVsActualSummary {
  cumulativePlannedQty: number;
  cumulativeActualQty: number;
  overallAchievementPct: number | null;
}

export interface PlanVsActualResult {
  orderId: string;
  days: PlanVsActualDay[];
  summary: PlanVsActualSummary;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Endpoint #3: for each planned day, joins against daily_production_log rows
// sharing this orderId AND that exact date — the linkage Part 1's orderId
// field made possible (see README "Client Flow Part 1" / "Client Flow Part
// 2"). Multiple same-day entries (e.g. across shifts) have their
// totalOutputQty summed; their downtime_log reasons are reused directly
// (Module 3's existing vocabulary), not re-captured. Days with zero matching
// logs are distinguished from a verified zero via `noDataLogged`.
export async function getPlanVsActual(orderId: string): Promise<PlanVsActualResult> {
  const planRows = await getProductionPlan(orderId);

  const logs = await prisma.dailyProductionLog.findMany({
    where: { orderId },
    include: { downtimeLogs: true },
  });

  const logsByDate = new Map<number, typeof logs>();
  for (const log of logs) {
    const key = log.logDate.getTime();
    const bucket = logsByDate.get(key);
    if (bucket) {
      bucket.push(log);
    } else {
      logsByDate.set(key, [log]);
    }
  }

  let cumulativePlannedQty = 0;
  let cumulativeActualQty = 0;

  const days: PlanVsActualDay[] = planRows.map((plan) => {
    const matchingLogs = logsByDate.get(plan.planDate.getTime()) ?? [];
    const noDataLogged = matchingLogs.length === 0;

    const actualQty = round2(matchingLogs.reduce((sum, log) => sum + Number(log.totalOutputQty ?? 0), 0));

    const minutesByReason = new Map<string, number>();
    for (const log of matchingLogs) {
      for (const downtime of log.downtimeLogs) {
        minutesByReason.set(downtime.reason, (minutesByReason.get(downtime.reason) ?? 0) + Number(downtime.minutes));
      }
    }
    const gapReasons = [...minutesByReason.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, totalMinutes]) => ({ reason, totalMinutes: round2(totalMinutes) }));

    const gap = round2(actualQty - plan.plannedQty);
    const achievementPct = plan.plannedQty === 0 ? null : round2((actualQty / plan.plannedQty) * 100);

    cumulativePlannedQty = round2(cumulativePlannedQty + plan.plannedQty);
    cumulativeActualQty = round2(cumulativeActualQty + actualQty);

    return {
      date: plan.planDate,
      plannedQty: plan.plannedQty,
      actualQty,
      gap,
      achievementPct,
      gapReasons,
      noDataLogged,
    };
  });

  const overallAchievementPct =
    cumulativePlannedQty === 0 ? null : round2((cumulativeActualQty / cumulativePlannedQty) * 100);

  return {
    orderId,
    days,
    summary: { cumulativePlannedQty, cumulativeActualQty, overallAchievementPct },
  };
}
