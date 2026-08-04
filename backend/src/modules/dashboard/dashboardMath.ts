// Pure dashboard math — no Prisma, no Express. See README "Module 14" for
// why this module is almost entirely a read/composition layer over Modules
// 4, 6, 7, 9, 10, and 11 — these two functions are the only genuinely new
// calculations Module 14 introduces.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface LineOutput {
  efficiencyPct: number;
  totalOutputQty: number;
}

/**
 * Production Efficiency: the output-weighted average of each line's static
 * rated `efficiencyPct`, weighted by how much it actually produced
 * (`totalOutputQty`) over the period — NOT actual-vs-theoretical output
 * (that's Capacity Utilization / Module 4's performancePct, a different
 * metric — see README "Module 14"). A line with zero output in the period
 * contributes zero weight and therefore doesn't affect the result at all,
 * regardless of its rated efficiency. Returns 0 (rather than NaN) when
 * every line had zero output (or the input is empty) — there is no
 * meaningful weighted average over zero total output.
 */
export function calculateWeightedEfficiency(lineOutputs: LineOutput[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const line of lineOutputs) {
    weightedSum += line.efficiencyPct * line.totalOutputQty;
    totalWeight += line.totalOutputQty;
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return round2(weightedSum / totalWeight);
}

export interface Completion {
  completedAt: Date;
  dueDate: Date | null;
}

export interface OnTimeRateResult {
  rate: number;
  onTimeCount: number;
  totalCount: number;
  /** Completions with no dueDate — excluded from `rate`/`onTimeCount`/`totalCount` entirely (can't judge on-time-ness without a due date), but reported, never silently dropped. */
  excludedNoDueDateCount: number;
}

/**
 * Delivery Performance: the on-time completion rate among `completions` that
 * actually have a `dueDate` to judge against. A completion is "on time" when
 * `completedAt <= dueDate`. `rate` is 0 (not NaN/null) when `totalCount` is 0
 * (either the input was empty, or every completion lacked a dueDate) —
 * there's nothing to compute a meaningful rate over, and 0 is the safer
 * default for a dashboard percentage than surfacing NaN.
 */
export function calculateOnTimeRate(completions: Completion[]): OnTimeRateResult {
  let onTimeCount = 0;
  let totalCount = 0;
  let excludedNoDueDateCount = 0;

  for (const completion of completions) {
    if (completion.dueDate == null) {
      excludedNoDueDateCount++;
      continue;
    }
    totalCount++;
    if (completion.completedAt.getTime() <= completion.dueDate.getTime()) {
      onTimeCount++;
    }
  }

  const rate = totalCount > 0 ? round2((onTimeCount / totalCount) * 100) : 0;

  return { rate, onTimeCount, totalCount, excludedNoDueDateCount };
}
