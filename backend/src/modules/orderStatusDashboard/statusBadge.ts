// Client Flow Part 5 — the Unified Order Status Dashboard's status-badge
// derivation. Pure, isolated, unit-tested — combines signals from THREE
// different subsystems (Module 2's order status, Module 10/11's
// schedule-based At Risk status, Part 4A's QC-Adjusted Completion Forecast,
// plus a QC-vs-production gap check), so the precedence order is documented
// exhaustively here and in README "Client Flow Part 5" — read both before
// changing this function.
import { OrderStatus, ScheduleStatus } from '@prisma/client';

export const STATUS_BADGE = {
  OnTrack: '🟢 On Track',
  AtRisk: '🟡 At Risk',
  Delayed: '🔴 Delayed',
  QcPending: '🔵 QC Pending',
  Completed: '✅ Completed',
} as const;

export type StatusBadge = (typeof STATUS_BADGE)[keyof typeof STATUS_BADGE];

export interface StatusBadgeInputs {
  /** Module 2's order.status. Closed orders are excluded from the dashboard entirely — never passed in here. */
  orderStatus: OrderStatus;
  /** Part 4A's CompletionForecastResult.isDelayedByForecast (null if no forecast could be computed). */
  isDelayedByForecast: boolean | null;
  /** Module 10/11's production_schedule.status (null if the order isn't scheduled yet). */
  scheduleStatus: ScheduleStatus | null;
  /** True if any daily_production_log.totalOutputQty > 0 has been recorded for this order. */
  hasProductionLogged: boolean;
  /** True if at least one daily_qc_inspections row exists for this order (a count check, not a quantity-sum proxy — see README). */
  hasQcInspectionRecorded: boolean;
}

/**
 * Precedence (most urgent/definitive first — the first matching rule wins,
 * every later rule is skipped):
 *
 * 1. `✅ Completed` — orderStatus === 'DispatchReady'. A hard state fact,
 *    checked before any forward-looking risk signal: once production has
 *    physically finished and the order is sitting ready to dispatch, "is it
 *    at risk of being late" / "is QC still pending" stop being the useful
 *    question — the order that reaches here is done, badge or not. (Closed
 *    orders never reach this function at all — the dashboard excludes them
 *    upstream — so this is the only "finished" state this function needs to
 *    represent.)
 * 2. `🔴 Delayed` — isDelayedByForecast === true. Part 4A's QC-Adjusted
 *    Completion Forecast projecting a real due-date miss from actual
 *    accepted output is the single most concrete, most urgent risk signal
 *    available, so it outranks the coarser schedule-based At Risk check.
 * 3. `🟡 At Risk` — scheduleStatus === 'AtRisk' (Module 10/11's own
 *    schedule-slack signal, reused verbatim, never recomputed) AND not
 *    already Delayed above. Deliberately does NOT treat
 *    scheduleStatus === 'RMShortage' as At Risk here — that's a distinct
 *    Module 6 concept (material shortage, not schedule slack) with its own
 *    dedicated surfaces (CTB dashboard, shortage report); folding it into
 *    this badge would blur two different problems into one signal.
 * 4. `🔵 QC Pending` — hasProductionLogged && !hasQcInspectionRecorded. A
 *    real, precisely-defined gap ("production happened, nobody has QC'd any
 *    of it yet for this order"), not a rejection-rate threshold guess — see
 *    README for why a threshold-based definition was deliberately rejected.
 * 5. `🟢 On Track` — none of the above triggered.
 */
export function deriveStatusBadge(inputs: StatusBadgeInputs): StatusBadge {
  if (inputs.orderStatus === OrderStatus.DispatchReady) {
    return STATUS_BADGE.Completed;
  }
  if (inputs.isDelayedByForecast === true) {
    return STATUS_BADGE.Delayed;
  }
  if (inputs.scheduleStatus === ScheduleStatus.AtRisk) {
    return STATUS_BADGE.AtRisk;
  }
  if (inputs.hasProductionLogged && !inputs.hasQcInspectionRecorded) {
    return STATUS_BADGE.QcPending;
  }
  return STATUS_BADGE.OnTrack;
}
