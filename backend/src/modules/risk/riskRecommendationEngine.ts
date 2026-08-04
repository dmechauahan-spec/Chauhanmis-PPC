// Pure risk-recommendation math — no Prisma, no Express. Module 10 already
// computes and stores `slackDays`/`status` on every production_schedule row
// (Slack = Due Date − Planned End Date) — this file never recomputes or
// duplicates that; it only takes an already-At-Risk schedule row as a given
// and projects three "what if" options for closing the gap. See README
// "Module 11" for the full framing: this is a planning aid, not a
// guaranteed outcome, hence `isEstimate: true` and the `disclaimer` on every
// result.

import {
  SchedulingLineInput,
  SchedulingProductInput,
  addDaysUTC,
  computeDailyOutput,
  diffDaysUTC,
  round2,
} from '../scheduling/schedulingEngine';

// Planning heuristics, NOT labor-law-verified figures — see README "Module
// 11". Named, documented constants so the assumption is visible and easy to
// retune, same spirit as Module 10's AVAILABLE_MINUTES_PER_DAY.
export const OVERTIME_EXTRA_MINUTES = 120;
export const EXTENDED_SHIFT_EXTRA_MINUTES = 240;

export const RECOMMENDATION_DISCLAIMER =
  'These are planning estimates computed from the same capacity formula Module 10 uses for scheduling — not guaranteed outcomes. Actual results depend on real-world execution.';

export interface RiskScheduleInput {
  orderId: string;
  qty: number;
  /** The order's already-assigned start date on its current line (Module 10's output) — unchanged for Options A/B. */
  startDate: Date;
  /** The order's own due date, snapshotted onto the schedule row by Module 10. Always non-null for an At-Risk row (no dueDate never reads At Risk — see Module 10). */
  dueDate: Date;
  /** Module 10's stored slack for the current assignment — read, never recomputed. */
  slackDays: number;
}

export interface RiskOrderInput {
  /** Snapshotted product type (orders.product), used to filter candidateLines for Option C. */
  productType: string;
}

/** A candidate line for Option C, carrying its own next-available date — the Module 10 `lineAvailableFrom` concept, per-line. */
export interface RiskCandidateLineInput extends SchedulingLineInput {
  availableFrom: Date;
}

export type RecommendationOptionName = 'Overtime' | 'Extended Shift' | 'Additional Line';

interface BaseOption {
  option: RecommendationOptionName;
  /** Always true: every option here is a projection, not a commitment. */
  isEstimate: true;
}

export interface ApplicableOption extends BaseOption {
  applicable: true;
  newDailyOutput: number;
  newDaysNeeded: number;
  newEstEndDate: Date;
  newSlackDays: number;
  closesGap: boolean;
}

export interface InapplicableOption extends BaseOption {
  applicable: false;
  reason: string;
}

export interface AdditionalLineApplicableOption extends ApplicableOption {
  recommendedLineId: string;
  recommendedLineName: string;
  /** How many OTHER feasible candidate lines existed besides the recommended one — a count, not the full list, per README "Module 11". */
  otherFeasibleLineCount: number;
}

export type RecommendationOption = ApplicableOption | InapplicableOption | AdditionalLineApplicableOption;

export interface RiskRecommendationsResult {
  orderId: string;
  currentSlackDays: number;
  options: RecommendationOption[];
  disclaimer: string;
}

// Recomputes dailyOutput/daysNeeded/estEndDate/slackDays for the SAME line
// and SAME present workers, only changing the available-minutes-per-day
// figure (Options A and B — Overtime / Extended Shift both work this way).
function projectExtraMinutes(
  optionName: RecommendationOptionName,
  extraMinutes: number,
  schedule: RiskScheduleInput,
  product: SchedulingProductInput,
  line: SchedulingLineInput,
  workersPresent: number,
): RecommendationOption {
  const dailyOutput = computeDailyOutput({
    availableMinutesPerDay: 480 + extraMinutes,
    taktTimeSec: product.taktTimeSec,
    manpowerRequired: product.manpowerRequired,
    efficiencyPct: line.efficiencyPct,
    workersPresent,
  });

  if (!(dailyOutput > 0)) {
    return {
      option: optionName,
      applicable: false,
      isEstimate: true,
      reason: 'The current line/workers configuration produces zero output even with extended hours.',
    };
  }

  const newDaysNeeded = Math.ceil(schedule.qty / dailyOutput);
  const newEstEndDate = addDaysUTC(schedule.startDate, newDaysNeeded - 1);
  const newSlackDays = diffDaysUTC(schedule.dueDate, newEstEndDate);

  return {
    option: optionName,
    applicable: true,
    isEstimate: true,
    newDailyOutput: round2(dailyOutput),
    newDaysNeeded,
    newEstEndDate,
    newSlackDays,
    closesGap: newSlackDays >= 0,
  };
}

// Option C: runs the order across BOTH the current line and a candidate
// line simultaneously. Both lines must be free to start together, so the
// combined run's start date is the LATER of the order's own startDate and
// the candidate's own next-available date — reusing Module 10's
// lineAvailableFrom concept per-candidate, never assuming day 0.
function projectAdditionalLine(
  schedule: RiskScheduleInput,
  order: RiskOrderInput,
  product: SchedulingProductInput,
  currentLine: SchedulingLineInput,
  presentWorkersByLine: Map<string, number>,
  candidateLines: RiskCandidateLineInput[],
): RecommendationOption {
  const eligible = candidateLines.filter(
    (line) => line.lineId !== currentLine.lineId && line.compatibleProductTypes.includes(order.productType),
  );

  if (eligible.length === 0) {
    return {
      option: 'Additional Line',
      applicable: false,
      isEstimate: true,
      reason: 'No other Active, compatible line is available to run this order in parallel.',
    };
  }

  const currentDailyOutput = computeDailyOutput({
    availableMinutesPerDay: 480,
    taktTimeSec: product.taktTimeSec,
    manpowerRequired: product.manpowerRequired,
    efficiencyPct: currentLine.efficiencyPct,
    workersPresent: presentWorkersByLine.get(currentLine.lineId) ?? 0,
  });

  const projected = eligible
    .map((line) => {
      const candidateDailyOutput = computeDailyOutput({
        availableMinutesPerDay: 480,
        taktTimeSec: product.taktTimeSec,
        manpowerRequired: product.manpowerRequired,
        efficiencyPct: line.efficiencyPct,
        workersPresent: presentWorkersByLine.get(line.lineId) ?? 0,
      });
      return { line, combinedDailyOutput: currentDailyOutput + candidateDailyOutput };
    })
    .filter(({ combinedDailyOutput }) => combinedDailyOutput > 0)
    .map(({ line, combinedDailyOutput }) => {
      const combinedStartDate = line.availableFrom.getTime() > schedule.startDate.getTime() ? line.availableFrom : schedule.startDate;
      const daysNeeded = Math.ceil(schedule.qty / combinedDailyOutput);
      const estEndDate = addDaysUTC(combinedStartDate, daysNeeded - 1);
      const slackDays = diffDaysUTC(schedule.dueDate, estEndDate);
      return { line, combinedDailyOutput, daysNeeded, estEndDate, slackDays };
    });

  if (projected.length === 0) {
    return {
      option: 'Additional Line',
      applicable: false,
      isEstimate: true,
      reason: 'Every candidate line is infeasible (zero output) for this order.',
    };
  }

  // Best (least negative / most positive) newSlackDays wins; tie-break on
  // lowest lineId alphabetically, same determinism chain as Module 10.
  const sorted = [...projected].sort((a, b) => {
    const slackDiff = b.slackDays - a.slackDays;
    if (slackDiff !== 0) return slackDiff;
    return a.line.lineId.localeCompare(b.line.lineId);
  });
  const best = sorted[0];

  return {
    option: 'Additional Line',
    applicable: true,
    isEstimate: true,
    newDailyOutput: round2(best.combinedDailyOutput),
    newDaysNeeded: best.daysNeeded,
    newEstEndDate: best.estEndDate,
    newSlackDays: best.slackDays,
    closesGap: best.slackDays >= 0,
    recommendedLineId: best.line.lineId,
    recommendedLineName: best.line.lineName,
    otherFeasibleLineCount: sorted.length - 1,
  };
}

/**
 * Given a single At-Risk schedule row, projects three what-if options for
 * closing the slack gap: Overtime, Extended Shift (both same line/workers,
 * more available minutes per day), and Additional Line (running the order
 * across the current line plus the best other compatible Active line at
 * once). Every option is returned even when it doesn't apply or doesn't
 * close the gap — see README "Module 11" for why omitting a lever a planner
 * didn't get to see would be worse than showing it didn't help.
 */
export function generateRiskRecommendations(
  schedule: RiskScheduleInput,
  order: RiskOrderInput,
  product: SchedulingProductInput,
  currentLine: SchedulingLineInput,
  presentWorkersByLine: Map<string, number>,
  candidateLines: RiskCandidateLineInput[],
): RiskRecommendationsResult {
  const currentWorkers = presentWorkersByLine.get(currentLine.lineId) ?? 0;

  const overtime = projectExtraMinutes('Overtime', OVERTIME_EXTRA_MINUTES, schedule, product, currentLine, currentWorkers);
  const extendedShift = projectExtraMinutes(
    'Extended Shift',
    EXTENDED_SHIFT_EXTRA_MINUTES,
    schedule,
    product,
    currentLine,
    currentWorkers,
  );
  const additionalLine = projectAdditionalLine(schedule, order, product, currentLine, presentWorkersByLine, candidateLines);

  return {
    orderId: schedule.orderId,
    currentSlackDays: schedule.slackDays,
    options: [overtime, extendedShift, additionalLine],
    disclaimer: RECOMMENDATION_DISCLAIMER,
  };
}
