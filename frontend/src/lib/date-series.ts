import type { ProductionPeriodRow } from "@/types/api";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The backend's GET /api/dashboard/overview only returns a production row
 * for days that actually have a daily_production_log entry (a GROUP BY over
 * existing rows — see ppc-backend's dashboard.service.ts) — it never
 * zero-fills days with no log. A sparse range (e.g. 1 day of real data out
 * of a 30-day window) therefore arrives as a 1-element array, not a
 * 30-element array with 29 zeros.
 *
 * MiniBarChart maps 1 bar per array element, not 1 bar per calendar day —
 * so that 1-element array renders as a single full-width bar, reading as
 * "one solid block" instead of a daily skyline. This fills in every missing
 * day in [dateFrom, dateTo] with a zero-output placeholder so the chart
 * always shows one bar per day, matching what "daily production output"
 * actually implies.
 */
export function fillDailyProductionSeries(
  rows: ProductionPeriodRow[],
  dateFromIso: string,
  dateToIso: string,
): ProductionPeriodRow[] {
  const byDay = new Map<string, ProductionPeriodRow>();
  for (const row of rows) {
    byDay.set(row.periodLabel.slice(0, 10), row);
  }

  const start = new Date(`${dateFromIso.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${dateToIso.slice(0, 10)}T00:00:00.000Z`);

  const filled: ProductionPeriodRow[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    const dayKey = new Date(t).toISOString().slice(0, 10);
    const existing = byDay.get(dayKey);
    filled.push(
      existing ?? {
        periodLabel: `${dayKey}T00:00:00.000Z`,
        totalOutputQty: 0,
        totalGoodQty: 0,
        avgAttendancePct: null,
      },
    );
  }
  return filled;
}
