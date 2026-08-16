// Client Flow Part 4A — QC-Adjusted Completion Forecast. Pure math, isolated
// and unit-tested, no I/O — productionPlan.service.ts is the only caller.
//
// Deliberately NOT the same thing as Module 11's At-Risk/On-Track schedule
// prediction. Module 11 is schedule-based (slackDays: planned dates vs. due
// date — it never looks at what was actually produced). This forecast is
// QC-acceptance-based: it projects forward from actual accepted (QC-passed)
// production so far, a genuinely different and complementary signal — a
// schedule can look On Track while real accepted output quietly falls
// behind, or vice versa. Naming throughout (isDelayedByForecast, not
// 'On Track'/'At Risk') is deliberately distinct from Module 11's string
// literals so the two are never visually confused in a UI showing both. See
// README "Client Flow Part 4".
import { addDaysUTC, round2, startOfDayUTC } from '../scheduling/schedulingEngine';

// A recent-trend window, not the whole order-to-date average — a
// whole-history average reacts too slowly to a recent slowdown or speedup
// (e.g. a line that's been down for the last 3 days would still show a
// healthy historical average for weeks). 7 days is a reasonable "how are we
// doing lately" window for a daily-cadence production floor: long enough to
// smooth over a single bad or exceptional day, short enough to actually
// react to a real trend change within about a week. Tunable — not a
// validated-optimal figure.
export const COMPLETION_FORECAST_WINDOW_DAYS = 7;

export interface CompletionForecastInputs {
  orderQty: number;
  /** Part 3's acceptedProductionQty (== totalPassedQty) for this order, all-time. */
  acceptedProductionQty: number;
  /** Sum of passedQty across every QC inspection within the trailing window. */
  windowPassedQtySum: number;
  windowDays: number;
  dueDate: Date | null;
  today: Date;
}

export interface CompletionForecastResult {
  balanceQty: number;
  currentAvgDailyAccepted: number;
  /** Null only when there's no recent accepted production to project from — see noDataReason. */
  remainingProductionDays: number | null;
  expectedCompletionDate: Date | null;
  dueDate: Date | null;
  /** Null when there's no dueDate to compare against, or no forecast could be computed at all. */
  isDelayedByForecast: boolean | null;
  windowDaysUsed: number;
  noDataReason?: string;
}

export function computeCompletionForecast(inputs: CompletionForecastInputs): CompletionForecastResult {
  const today = startOfDayUTC(inputs.today);
  const dueDate = inputs.dueDate ? startOfDayUTC(inputs.dueDate) : null;
  const balanceQty = round2(inputs.orderQty - inputs.acceptedProductionQty);
  const currentAvgDailyAccepted = round2(inputs.windowPassedQtySum / inputs.windowDays);

  // Already met (or exceeded) the ordered qty via accepted production —
  // nothing left to project. Checked BEFORE the no-recent-production guard
  // below: an order that finished production days ago may legitimately have
  // zero QC activity in the trailing window, and that must read as "already
  // done," not "no data."
  if (balanceQty <= 0) {
    return {
      balanceQty,
      currentAvgDailyAccepted,
      remainingProductionDays: 0,
      expectedCompletionDate: today,
      dueDate,
      isDelayedByForecast: dueDate ? today.getTime() > dueDate.getTime() : null,
      windowDaysUsed: inputs.windowDays,
    };
  }

  // Divide-by-zero guard: no accepted production at all in the window means
  // there's nothing to honestly project a rate from — return null with a
  // clear reason rather than Infinity or a crash.
  if (currentAvgDailyAccepted <= 0) {
    return {
      balanceQty,
      currentAvgDailyAccepted,
      remainingProductionDays: null,
      expectedCompletionDate: null,
      dueDate,
      isDelayedByForecast: null,
      windowDaysUsed: inputs.windowDays,
      noDataReason: `No accepted (QC-passed) production recorded in the last ${inputs.windowDays} day(s) — cannot project a completion date.`,
    };
  }

  const remainingProductionDays = round2(balanceQty / currentAvgDailyAccepted);
  // A "day" is discrete for date arithmetic — round the fractional day count
  // UP (never claim completion sooner than the math actually supports),
  // while remainingProductionDays itself keeps the precise fractional value
  // for display.
  const expectedCompletionDate = addDaysUTC(today, Math.ceil(remainingProductionDays));
  const isDelayedByForecast = dueDate ? expectedCompletionDate.getTime() > dueDate.getTime() : null;

  return {
    balanceQty,
    currentAvgDailyAccepted,
    remainingProductionDays,
    expectedCompletionDate,
    dueDate,
    isDelayedByForecast,
    windowDaysUsed: inputs.windowDays,
  };
}
