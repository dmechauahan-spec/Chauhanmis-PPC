import { CtbStatus, LineStatus, OrderStatus, Prisma, ScheduleStatus } from '@prisma/client';
import { prisma } from '../../db/client';
import { logger } from '../../middleware/requestLogger';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { updateOrderStatus } from '../orders/orders.service';
import {
  ScheduledAssignment,
  SchedulingLineInput,
  SchedulingOrderInput,
  SchedulingPriority,
  SchedulingProductInput,
  UnscheduledOrder,
  addDaysUTC,
  runSchedulingPass,
  startOfDayUTC,
} from './schedulingEngine';
import { ListScheduleQuery, RunSchedulingInput, UnscheduleOrderInput } from './scheduling.schema';

// System actor recorded on the order_status_history row whenever the
// scheduling engine (not a human caller) drives an Open -> Scheduled
// transition via POST /api/scheduling/run — there is no `changedBy` field on
// that endpoint's request body (it's a bulk action over every eligible
// order, not a single-order call), so a fixed system label is used instead.
const SCHEDULING_ENGINE_ACTOR = 'scheduling-engine';

function toScheduleStatus(status: 'On Track' | 'At Risk'): ScheduleStatus {
  return status === 'On Track' ? ScheduleStatus.OnTrack : ScheduleStatus.AtRisk;
}

// Shared with Module 11 (Risk Prediction Engine), which needs this same
// "when is this line next free" figure for its Additional Line option's
// candidate lines — exported so both modules call one implementation
// instead of maintaining two copies. For each id in `lineIds`: max
// `estEndDate` + 1 across every production_schedule row already committed
// to that line, or today's date (UTC, midnight) if the line has none yet.
// Scoped to exactly the given lineIds (not every row in the table) — both
// callers only ever look up ids from this same list, so scoping the query
// is a pure efficiency win, not a behavior change.
export async function computeLineAvailableFrom(lineIds: string[]): Promise<Map<string, Date>> {
  const scheduleRows =
    lineIds.length > 0
      ? await prisma.productionSchedule.findMany({
          where: { lineId: { in: lineIds } },
          select: { lineId: true, estEndDate: true },
        })
      : [];

  const maxEndByLine = new Map<string, Date>();
  for (const row of scheduleRows) {
    if (!row.lineId || !row.estEndDate) continue;
    const current = maxEndByLine.get(row.lineId);
    if (!current || row.estEndDate.getTime() > current.getTime()) {
      maxEndByLine.set(row.lineId, row.estEndDate);
    }
  }

  const today = startOfDayUTC(new Date());
  const result = new Map<string, Date>();
  for (const lineId of lineIds) {
    const maxEnd = maxEndByLine.get(lineId);
    result.set(lineId, maxEnd ? addDaysUTC(maxEnd, 1) : today);
  }
  return result;
}

// Fetches every input runSchedulingPass needs, fully assembled from current
// DB state — queried fresh on every call, never cached, per README "Module
// 10" (a stale eligible-orders list would silently re-offer an order someone
// already scheduled through a different path).
async function gatherSchedulingInputs() {
  const eligibleOrders = await prisma.order.findMany({
    where: {
      status: { not: OrderStatus.Closed },
      ctbStatus: CtbStatus.ClearToBuild,
      schedules: { none: {} },
    },
  });

  const activeLines = await prisma.productionLine.findMany({
    where: { status: LineStatus.Active },
    include: { compatibility: true },
  });

  const hrGrouped = await prisma.hrTeam.groupBy({ by: ['lineId'], _sum: { workers: true } });

  const skus = [...new Set(eligibleOrders.map((o) => o.sku))];
  const products = skus.length > 0 ? await prisma.product.findMany({ where: { sku: { in: skus } } }) : [];

  const lineAvailableFrom = await computeLineAvailableFrom(activeLines.map((l) => l.lineId));

  const orderInputs: SchedulingOrderInput[] = eligibleOrders.map((o) => ({
    orderId: o.orderId,
    sku: o.sku,
    productType: o.product,
    qty: o.qty,
    priority: o.priority as SchedulingPriority,
    dueDate: o.dueDate,
  }));

  const lineInputs: SchedulingLineInput[] = activeLines.map((l) => ({
    lineId: l.lineId,
    lineName: l.lineName,
    efficiencyPct: Number(l.efficiencyPct),
    compatibleProductTypes: l.compatibility.map((c) => c.productType),
  }));

  const productsBySku = new Map<string, SchedulingProductInput>(
    products.map((p) => [p.sku, { taktTimeSec: Number(p.taktTimeSec), manpowerRequired: p.manpowerRequired }]),
  );

  const presentWorkersByLine = new Map<string, number>();
  for (const row of hrGrouped) {
    if (row.lineId) {
      presentWorkersByLine.set(row.lineId, row._sum.workers ?? 0);
    }
  }

  const orderById = new Map(eligibleOrders.map((o) => [o.orderId, o]));

  return { orderInputs, lineInputs, productsBySku, presentWorkersByLine, lineAvailableFrom, orderById };
}

export interface FailedAssignment {
  orderId: string;
  error: string;
}

export interface RunSchedulingSummary {
  totalEligible: number;
  scheduledCount: number;
  unscheduledCount: number;
  failedCount: number;
}

export interface RunSchedulingResult {
  scheduled: ScheduledAssignment[];
  unscheduled: UnscheduledOrder[];
  failed: FailedAssignment[];
  summary: RunSchedulingSummary;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Endpoint #1: the scheduling pass. dryRun: true returns the proposed result
// without writing anything; dryRun: false (default) persists it.
//
// Persistence is deliberately NOT one single enclosing transaction across
// every scheduled order. Module 2's updateOrderStatus manages its own
// transaction internally using the shared `prisma` client; wrapping a call
// to it inside an outer `prisma.$transaction(tx => ...)` would not actually
// compose into one atomic unit (the inner call still uses the global client,
// not `tx`), and would hold the outer transaction's connection open across
// every order in the batch for no real atomicity benefit — a real risk
// against a small Postgres connection pool. Instead, each scheduled order's
// production_schedule row is created, then its status is transitioned via
// Module 2's reused, unmodified updateOrderStatus — sequentially, per order.
// See README "Module 10" for the full reasoning.
//
// Because there is no enclosing transaction across orders, one order's write
// failing partway through the batch must not abort the remaining orders, and
// must not silently discard the orders that already succeeded before it —
// each order's persistence is wrapped in its own try/catch: a failure is
// recorded in `failed` (with the underlying error message) and the loop
// moves on to the next order, instead of throwing out of runScheduling and
// turning what's actually a partial success into a response that looks like
// a total failure. If the schedule row itself was created but the status
// transition then failed, a best-effort cleanup deletes that row so the
// order is left fully eligible again for the next run, rather than stuck
// with an orphaned schedule row on a still-Open order.
export async function runScheduling(input: RunSchedulingInput): Promise<RunSchedulingResult> {
  const { orderInputs, lineInputs, productsBySku, presentWorkersByLine, lineAvailableFrom, orderById } =
    await gatherSchedulingInputs();

  const result = runSchedulingPass(orderInputs, lineInputs, productsBySku, presentWorkersByLine, lineAvailableFrom);

  const persisted: ScheduledAssignment[] = [];
  const failed: FailedAssignment[] = [];

  if (!input.dryRun) {
    for (const assignment of result.scheduled) {
      const order = orderById.get(assignment.orderId);
      /* istanbul ignore next -- defensive: assignment always originates from orderById's own keys */
      if (!order) continue;

      let scheduleCreated = false;
      try {
        await prisma.productionSchedule.create({
          data: {
            orderId: assignment.orderId,
            client: order.client,
            sku: assignment.sku,
            product: assignment.productType,
            qty: assignment.qty,
            lineId: assignment.lineId,
            lineName: assignment.lineName,
            dailyOutput: assignment.dailyOutput,
            workersPresent: assignment.workersPresent,
            workersRequired: assignment.workersRequired,
            shiftMode: 'General',
            daysNeeded: assignment.daysNeeded,
            startDate: assignment.startDate,
            estEndDate: assignment.estEndDate,
            dueDate: assignment.dueDate,
            slackDays: assignment.slackDays,
            status: toScheduleStatus(assignment.status),
          },
        });
        scheduleCreated = true;

        await updateOrderStatus(assignment.orderId, { newStatus: OrderStatus.Scheduled }, SCHEDULING_ENGINE_ACTOR);

        persisted.push(assignment);
        logger.info(
          { orderId: assignment.orderId, lineId: assignment.lineId },
          'Scheduling engine assigned order to line and transitioned status to Scheduled',
        );
      } catch (err) {
        if (scheduleCreated) {
          await prisma.productionSchedule.deleteMany({ where: { orderId: assignment.orderId } }).catch(() => {
            /* best-effort cleanup only — the failure below is reported either way */
          });
        }
        failed.push({ orderId: assignment.orderId, error: errorMessage(err) });
        logger.error(
          { orderId: assignment.orderId, err },
          'Scheduling engine failed to persist this order — continuing with the remaining orders in the batch',
        );
      }
    }
  }

  const scheduledOut = input.dryRun ? result.scheduled : persisted;

  return {
    scheduled: scheduledOut,
    unscheduled: result.unscheduled,
    failed,
    summary: {
      totalEligible: orderInputs.length,
      scheduledCount: scheduledOut.length,
      unscheduledCount: result.unscheduled.length,
      failedCount: failed.length,
    },
  };
}

type ScheduleRow = Awaited<ReturnType<typeof prisma.productionSchedule.findUniqueOrThrow>>;

export async function listSchedule(query: ListScheduleQuery): Promise<PaginatedResult<ScheduleRow>> {
  const where: Prisma.ProductionScheduleWhereInput = {};
  if (query.lineId) where.lineId = query.lineId;
  if (query.status) where.status = query.status === 'OnTrack' ? ScheduleStatus.OnTrack : ScheduleStatus.AtRisk;
  if (query.startDateFrom || query.startDateTo) {
    where.startDate = {
      ...(query.startDateFrom ? { gte: new Date(query.startDateFrom) } : {}),
      ...(query.startDateTo ? { lte: new Date(query.startDateTo) } : {}),
    };
  }
  if (query.estEndDateFrom || query.estEndDateTo) {
    where.estEndDate = {
      ...(query.estEndDateFrom ? { gte: new Date(query.estEndDateFrom) } : {}),
      ...(query.estEndDateTo ? { lte: new Date(query.estEndDateTo) } : {}),
    };
  }

  const { skip, take } = toSkipTake(query);
  const [items, total] = await prisma.$transaction([
    prisma.productionSchedule.findMany({ where, skip, take, orderBy: { startDate: 'asc' } }),
    prisma.productionSchedule.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getScheduleForOrder(orderId: string): Promise<ScheduleRow> {
  const row = await prisma.productionSchedule.findUnique({ where: { orderId } });
  if (!row) {
    throw new NotFoundError('Schedule for order', orderId);
  }
  return row;
}

// Endpoint #4: Design decision #2 — un-scheduling is an explicit
// administrative reversal, not a normal forward status transition. It
// deletes the production_schedule row and writes orders.status back to Open
// directly, bypassing Module 2's transition validator on purpose (a
// Scheduled -> Open move is backward, which that validator correctly refuses
// as a normal transition) while still writing a complete order_status_history
// row so the audit trail stays intact. See README "Module 10" for why this
// is deliberately the only place in the API allowed to do this, and why it's
// meant to stay a rare, deliberate admin action, not a pattern to copy
// elsewhere.
//
// Only reachable from Scheduled: an order that has progressed further
// (Running, QC, ...) has real production activity behind it that a bare
// status flip back to Open can't undo — see README "Assumptions".
export async function unscheduleOrder(orderId: string, input: UnscheduleOrderInput, changedBy: string): Promise<void> {
  const schedule = await prisma.productionSchedule.findUnique({ where: { orderId } });
  if (!schedule) {
    throw new NotFoundError('Schedule for order', orderId);
  }

  const order = await prisma.order.findUnique({ where: { orderId } });
  /* istanbul ignore next -- a production_schedule row always references a real order (FK) */
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }

  if (order.status !== OrderStatus.Scheduled) {
    throw new BusinessRuleError(
      `Order '${orderId}' cannot be un-scheduled because its status is '${order.status}'. Only orders currently in 'Scheduled' status can be un-scheduled.`,
      { currentStatus: order.status },
      400,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.productionSchedule.delete({ where: { orderId } });
    await tx.order.update({ where: { orderId }, data: { status: OrderStatus.Open } });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        oldStatus: OrderStatus.Scheduled,
        newStatus: OrderStatus.Open,
        changedBy,
        notes: input.reason,
      },
    });
  });

  logger.info({ orderId, reason: input.reason }, 'Order un-scheduled: schedule removed, status reverted to Open');
}
