import type { StatusDotVariant } from "@/components/status-dot";

interface KpiThresholds {
  /** value >= this -> success */
  goodAt: number;
  /** value < this -> critical */
  criticalBelow: number;
}

/**
 * Simple 3-tier good/neutral/critical bands per KPI — a judgment call, not a
 * spec'd or customer-provided target. Kept deliberately simple (one
 * good-at, one critical-below cutoff per metric) rather than building a
 * more elaborate scoring scheme.
 */
export const KPI_THRESHOLDS = {
  // ~75% is a commonly cited "good OEE" rule of thumb for discrete
  // manufacturing (world-class is usually cited around 85%; below 50% is
  // generally considered to need attention).
  oee: { goodAt: 75, criticalBelow: 50 } satisfies KpiThresholds,
  // Capacity Utilization is actual vs. standard output on a near-term
  // production run — expected to sit closer to 100% than OEE, since it
  // excludes the availability/quality factors OEE also weighs in.
  capacityUtilization: { goodAt: 85, criticalBelow: 65 } satisfies KpiThresholds,
  // Production Efficiency is the output-weighted average of each line's
  // rated efficiency — a slightly looser band than Capacity Utilization
  // since it reflects line configuration, not a single run's performance.
  productionEfficiency: { goodAt: 80, criticalBelow: 60 } satisfies KpiThresholds,
  // Matches the design brief's own worked example directly.
  deliveryPerformance: { goodAt: 90, criticalBelow: 70 } satisfies KpiThresholds,
} as const;

/** `value === null` means "no underlying data" (see dashboard-page.tsx) — always renders as `faint`, never a status color. */
export function kpiVariant(value: number | null, thresholds: KpiThresholds): StatusDotVariant {
  if (value === null) return "faint";
  if (value >= thresholds.goodAt) return "success";
  if (value < thresholds.criticalBelow) return "critical";
  return "info";
}
