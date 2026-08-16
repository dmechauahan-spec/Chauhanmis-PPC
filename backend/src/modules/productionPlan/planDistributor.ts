// Client Flow Part 2 — pure day-by-day quantity distribution, isolated and
// unit-tested for its exact rounding-remainder behavior (see README "Client
// Flow Part 2" for the worked example). No I/O, no Prisma — the service
// layer is the only caller.
import { round2 } from '../scheduling/schedulingEngine';

/**
 * Splits `totalQty` across `numDays` calendar days, allocating up to
 * `dailyOutput` per day and letting the LAST day absorb whatever is left —
 * never a fixed `dailyOutput` on every day. This is what guarantees the sum
 * across every returned day always exactly equals `totalQty`, regardless of
 * whether `dailyOutput * numDays` over- or under-shoots it:
 *
 *   - Even division (e.g. totalQty=3000, dailyOutput=1000, numDays=3):
 *     every day (including the last) gets exactly dailyOutput, since the
 *     remaining balance after 2 days of 1000 is itself exactly 1000.
 *   - Remainder case (e.g. totalQty=2500, dailyOutput=1000, numDays=3):
 *     day 1 = 1000, day 2 = 1000, day 3 (last) = 500 (whatever remains) —
 *     not 1000, which would over-allocate by 500.
 *   - Over-allocated schedule span (dailyOutput * numDays > totalQty, which
 *     can happen when the scheduling engine's estEndDate rounds up to a
 *     whole day it doesn't fully need): once `remaining` hits 0, every
 *     subsequent day — including the last — gets 0. Never negative.
 *
 * Each day's value is rounded to 2 decimal places (matching the
 * Decimal(12,2) `planned_qty` column) using the same running-remainder
 * subtraction the codebase already uses for OEE's rounding (see
 * schedulingEngine.ts's round2) — because the last day's value is always
 * "whatever remains" rather than an independently-rounded dailyOutput, any
 * rounding drift from earlier days is absorbed there too, so the returned
 * array's sum always equals round2(totalQty) exactly.
 */
export function distributeDailyPlanQty(totalQty: number, dailyOutput: number, numDays: number): number[] {
  if (!Number.isInteger(numDays) || numDays < 1) {
    throw new Error('numDays must be an integer >= 1');
  }
  if (totalQty < 0) {
    throw new Error('totalQty must be >= 0');
  }
  if (dailyOutput < 0) {
    throw new Error('dailyOutput must be >= 0');
  }

  const allocations: number[] = [];
  let remaining = round2(totalQty);

  for (let day = 0; day < numDays; day++) {
    const isLastDay = day === numDays - 1;
    const qty = isLastDay ? remaining : round2(Math.min(dailyOutput, remaining));
    allocations.push(qty);
    remaining = round2(remaining - qty);
  }

  return allocations;
}
