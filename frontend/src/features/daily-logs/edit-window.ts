// Mirrors ppc-backend's dailyLogs.service.ts EDIT_WINDOW_DAYS/
// isWithinEditWindow exactly — a log is only PATCH-able while its logDate
// is within this many days of "today" (currently 1, i.e. today or
// yesterday — NOT strictly "same calendar day", despite how that rule gets
// described informally). Used only to decide whether to show/enable the
// Edit action — a UX nicety, same caveat as order-pipeline.ts's
// getAllowedNextStatuses: the backend's own PATCH re-validates
// independently and returns its own 409 regardless of what this shows, so
// a stale copy of this constant can only ever show a wrong button, never
// let an invalid edit through. If EDIT_WINDOW_DAYS changes on the backend,
// this must be updated to match or the UI will drift out of sync.
const EDIT_WINDOW_DAYS = 1;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isDailyLogEditable(logDateIso: string): boolean {
  const diffDays = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(new Date(logDateIso)).getTime()) / 86_400_000,
  );
  return diffDays <= EDIT_WINDOW_DAYS;
}
