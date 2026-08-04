// Pure scheduling math — no Prisma, no Express. This is a deterministic,
// rule-based baseline scheduler (greedy heuristic): sort eligible orders by
// priority then due date, and for each, greedily assign the best available
// compatible line. See README "Module 10" for why this is explicitly NOT the
// spec's future AI Scheduling Optimizer ("10,000+ simulations") — that is a
// different, unbuilt feature; this module never claims to be it.

export type SchedulingPriority = 'Low' | 'Medium' | 'High';
export type SchedulingStatus = 'On Track' | 'At Risk';
export type UnscheduledReason = 'no_compatible_line' | 'no_feasible_line';

export interface SchedulingOrderInput {
  orderId: string;
  sku: string;
  /** Snapshotted product type (orders.product), matched against each line's compatibleProductTypes. */
  productType: string;
  qty: number;
  priority: SchedulingPriority;
  dueDate: Date | null;
}

export interface SchedulingLineInput {
  lineId: string;
  lineName: string;
  efficiencyPct: number;
  /** Product types this line is compatible with, per line_product_compatibility. */
  compatibleProductTypes: string[];
}

export interface SchedulingProductInput {
  taktTimeSec: number;
  manpowerRequired: number;
}

export interface ScheduledAssignment {
  orderId: string;
  sku: string;
  productType: string;
  qty: number;
  lineId: string;
  lineName: string;
  dailyOutput: number;
  workersPresent: number;
  workersRequired: number;
  daysNeeded: number;
  startDate: Date;
  estEndDate: Date;
  dueDate: Date | null;
  /** null when the order has no dueDate — there is nothing to be "at risk" against. */
  slackDays: number | null;
  status: SchedulingStatus;
}

export interface UnscheduledOrder {
  orderId: string;
  reason: UnscheduledReason;
}

export interface SchedulingPassResult {
  scheduled: ScheduledAssignment[];
  unscheduled: UnscheduledOrder[];
}

// A single named constant standing in for "one standard shift day." This
// module deliberately plans in whole-day increments, not per-shift — see
// README "Module 10" for why this is not unified with Module 4's per-log
// SHIFT_PLANNED_MINUTES lookup (that serves actual daily reporting of a
// shift that already happened; this serves forward-looking capacity
// planning across many future days). The two happen to both use 480 today,
// coincidentally, not because they share a definition.
export const AVAILABLE_MINUTES_PER_DAY = 480;

const PRIORITY_WEIGHT: Record<SchedulingPriority, number> = { High: 3, Medium: 2, Low: 1 };
const MS_PER_DAY = 86_400_000;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDaysUTC(date: Date, days: number): Date {
  return new Date(startOfDayUTC(date).getTime() + days * MS_PER_DAY);
}

export function diffDaysUTC(a: Date, b: Date): number {
  return Math.round((startOfDayUTC(a).getTime() - startOfDayUTC(b).getTime()) / MS_PER_DAY);
}

export interface DailyOutputInputs {
  availableMinutesPerDay: number;
  taktTimeSec: number;
  manpowerRequired: number;
  efficiencyPct: number;
  workersPresent: number;
}

// The capacity formula itself (Module 10's core math), extracted out of
// computeCandidate below so Module 11 (Risk Prediction Engine) can reuse it
// exactly — for its "current" baseline and for each what-if option's
// recomputation — rather than re-deriving it independently. Returns the raw,
// unrounded dailyOutput; 0 (or any non-positive value) means infeasible,
// same convention computeCandidate already used inline before this refactor.
export function computeDailyOutput(inputs: DailyOutputInputs): number {
  const { availableMinutesPerDay, taktTimeSec, manpowerRequired, efficiencyPct, workersPresent } = inputs;
  // Capped at 1: extra workers beyond the line's required headcount don't
  // increase throughput past the line's physical capacity — station count
  // and takt time already bound it. A deliberate modeling choice, not an
  // oversight — see README "Module 10".
  const workerRatio = manpowerRequired > 0 ? Math.min(1, workersPresent / manpowerRequired) : 0;
  const theoreticalOutput = (availableMinutesPerDay * 60) / taktTimeSec;
  return theoreticalOutput * (efficiencyPct / 100) * workerRatio;
}

// Orders are processed in this order and never revisited — priority first
// (High > Medium > Low), then earliest due date first within the same
// priority tier. An order with no dueDate sorts last within its tier (no
// deadline pressure to prioritize by), matching Module 8's precedent of
// treating a missing dueDate as neutral rather than maximally urgent.
function sortOrders(orders: SchedulingOrderInput[]): SchedulingOrderInput[] {
  return [...orders].sort((a, b) => {
    const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (weightDiff !== 0) return weightDiff;
    const aDue = a.dueDate ? a.dueDate.getTime() : Infinity;
    const bDue = b.dueDate ? b.dueDate.getTime() : Infinity;
    return aDue - bDue;
  });
}

// Computes the full candidate result for one (order, line) pair, or null if
// the line is infeasible for this order (dailyOutput <= 0 — zero present
// workers, or bad manpowerRequired master data) rather than dividing by zero
// or producing an infinite daysNeeded.
function computeCandidate(
  order: SchedulingOrderInput,
  line: SchedulingLineInput,
  product: SchedulingProductInput,
  workersPresent: number,
  availableFrom: Date,
): ScheduledAssignment | null {
  const workersRequired = product.manpowerRequired;
  const dailyOutput = computeDailyOutput({
    availableMinutesPerDay: AVAILABLE_MINUTES_PER_DAY,
    taktTimeSec: product.taktTimeSec,
    manpowerRequired: product.manpowerRequired,
    efficiencyPct: line.efficiencyPct,
    workersPresent,
  });

  if (!(dailyOutput > 0)) {
    return null;
  }

  const daysNeeded = Math.ceil(order.qty / dailyOutput);
  const startDate = startOfDayUTC(availableFrom);
  const estEndDate = addDaysUTC(startDate, daysNeeded - 1);
  const slackDays = order.dueDate ? diffDaysUTC(order.dueDate, estEndDate) : null;
  const status: SchedulingStatus = slackDays === null || slackDays >= 0 ? 'On Track' : 'At Risk';

  return {
    orderId: order.orderId,
    sku: order.sku,
    productType: order.productType,
    qty: order.qty,
    lineId: line.lineId,
    lineName: line.lineName,
    dailyOutput: round2(dailyOutput),
    workersPresent,
    workersRequired,
    daysNeeded,
    startDate,
    estEndDate,
    dueDate: order.dueDate,
    slackDays,
    status,
  };
}

// Among feasible candidates, pick earliest estEndDate; tie-break on higher
// dailyOutput; if still tied, lowest lineId alphabetically. This chain
// exists so "smart" scheduling is reproducible, not silently random when
// two lines are functionally equivalent for an order.
function pickBestCandidate(candidates: ScheduledAssignment[]): ScheduledAssignment {
  const sorted = [...candidates].sort((a, b) => {
    const endDiff = a.estEndDate.getTime() - b.estEndDate.getTime();
    if (endDiff !== 0) return endDiff;
    const outputDiff = b.dailyOutput - a.dailyOutput;
    if (outputDiff !== 0) return outputDiff;
    return a.lineId.localeCompare(b.lineId);
  });
  return sorted[0];
}

/**
 * Runs one full scheduling pass over `orders`, greedily assigning each (in
 * priority-then-due-date order) to the best compatible, feasible line.
 *
 * `lineAvailableFrom` is mutated conceptually via a working copy — the
 * caller's map is never mutated in place, but every order sees the
 * cumulative effect of every earlier order's assignment in this same pass
 * (a chosen line's next availability is pushed to estEndDate + 1 before the
 * next order is considered). This sequential update is what makes the
 * result correct: computing every order against the same static starting
 * availability would let unrelated orders double-book the same line on the
 * same days.
 *
 * Every line the pure function considers is expected to already have an
 * entry in `lineAvailableFrom` (the service builds one for every Active
 * line, defaulting to "today" when a line has no prior schedule rows) — the
 * `new Date()` fallback below exists only as a defensive default for a key
 * that's unexpectedly missing, and is never exercised by this file's unit
 * tests, which always populate every relevant line explicitly.
 */
export function runSchedulingPass(
  orders: SchedulingOrderInput[],
  lines: SchedulingLineInput[],
  productsBySku: Map<string, SchedulingProductInput>,
  presentWorkersByLine: Map<string, number>,
  lineAvailableFrom: Map<string, Date>,
): SchedulingPassResult {
  const availability = new Map(lineAvailableFrom);
  const scheduled: ScheduledAssignment[] = [];
  const unscheduled: UnscheduledOrder[] = [];

  for (const order of sortOrders(orders)) {
    const compatibleLines = lines.filter((line) => line.compatibleProductTypes.includes(order.productType));

    if (compatibleLines.length === 0) {
      unscheduled.push({ orderId: order.orderId, reason: 'no_compatible_line' });
      continue;
    }

    const product = productsBySku.get(order.sku);
    const candidates: ScheduledAssignment[] = [];

    if (product) {
      for (const line of compatibleLines) {
        const workersPresent = presentWorkersByLine.get(line.lineId) ?? 0;
        const availableFrom = availability.get(line.lineId) ?? new Date();
        const candidate = computeCandidate(order, line, product, workersPresent, availableFrom);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }

    if (candidates.length === 0) {
      unscheduled.push({ orderId: order.orderId, reason: 'no_feasible_line' });
      continue;
    }

    const chosen = pickBestCandidate(candidates);
    scheduled.push(chosen);
    availability.set(chosen.lineId, addDaysUTC(chosen.estEndDate, 1));
  }

  return { scheduled, unscheduled };
}
