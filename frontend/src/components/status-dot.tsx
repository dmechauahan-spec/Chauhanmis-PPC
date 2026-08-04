import { cn } from "@/lib/utils";

export type StatusDotVariant = "success" | "info" | "critical" | "amber" | "faint";

const VARIANT_CLASS: Record<StatusDotVariant, string> = {
  success: "bg-status-success",
  info: "bg-status-info",
  critical: "bg-status-critical",
  amber: "bg-signal-amber",
  faint: "border border-surface-border bg-transparent",
};

// Single source of truth for "variant -> value text color," shared by every
// tile that pairs a StatusDot with a colored number (kpi-tile.tsx,
// stat-tile.tsx) so the two never drift out of sync with each other.
export const STATUS_TEXT_COLOR: Record<StatusDotVariant, string> = {
  success: "text-status-success",
  info: "text-status-info",
  critical: "text-status-critical",
  amber: "text-signal-amber",
  faint: "text-ink-faint",
};

/**
 * A plain status dot — same size/weight language as the pipeline stepper's
 * dots (src/components/pipeline-stepper.tsx), reused here instead of a
 * colored icon-in-a-box so KPI tiles read as part of the same visual system
 * rather than a generic "icon accent" dashboard pattern. Unlike the
 * stepper's "current stage" dot, this never pulses — that animation
 * specifically means "in progress right now," which doesn't apply to a KPI
 * number.
 */
export function StatusDot({ variant, className }: { variant: StatusDotVariant; className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full", VARIANT_CLASS[variant], className)} />;
}
