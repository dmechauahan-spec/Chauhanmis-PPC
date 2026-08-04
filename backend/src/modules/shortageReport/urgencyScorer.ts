// Pure urgency-scoring math — no Prisma, no Express. See README "Module 8 —
// Order-Wise Shortage Analysis" for the formula's rationale and a worked
// example.

export type PriorityLabel = 'Low' | 'Medium' | 'High';

export interface UrgencyOrderInput {
  priority: PriorityLabel;
  dueDate: Date | null;
}

export interface UrgencyShortageSummary {
  totalRequiredQty: number;
  totalShortQty: number;
}

export interface UrgencyResult {
  urgencyScore: number;
  isOverdue: boolean;
  /** Whole days from `today` to dueDate; negative means overdue. Null when the order has no dueDate. */
  daysToDue: number | null;
  /** (totalShortQty / totalRequiredQty) * 100, over the order's short components only — see README. */
  shortagePct: number;
}

const PRIORITY_WEIGHT: Record<PriorityLabel, number> = { High: 3, Medium: 2, Low: 1 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Whole-day difference, ignoring time-of-day, so "due today" is exactly 0
// regardless of what time `today` is constructed at.
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const fromUTC = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUTC = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUTC - fromUTC) / msPerDay);
}

/**
 * urgencyScore = (priorityWeight * 20)
 *              + (shortagePct * 0.5)
 *              + (daysToDue < 0 ? min(-daysToDue * 5, 100) : max(0, (14 - daysToDue) * 2))
 *
 * `today` defaults to `new Date()` but is accepted as a parameter so this
 * stays a pure, deterministic function for testing.
 */
export function calculateUrgencyScore(
  order: UrgencyOrderInput,
  shortage: UrgencyShortageSummary,
  today: Date = new Date(),
): UrgencyResult {
  const priorityWeight = PRIORITY_WEIGHT[order.priority];
  const shortagePct = shortage.totalRequiredQty > 0 ? round2((shortage.totalShortQty / shortage.totalRequiredQty) * 100) : 0;

  const daysToDue = order.dueDate ? daysBetween(today, order.dueDate) : null;
  const isOverdue = daysToDue != null && daysToDue < 0;

  const dueDateTerm =
    daysToDue == null ? 0 : daysToDue < 0 ? Math.min(-daysToDue * 5, 100) : Math.max(0, (14 - daysToDue) * 2);

  const urgencyScore = round2(priorityWeight * 20 + shortagePct * 0.5 + dueDateTerm);

  return { urgencyScore, isOverdue, daysToDue, shortagePct };
}
