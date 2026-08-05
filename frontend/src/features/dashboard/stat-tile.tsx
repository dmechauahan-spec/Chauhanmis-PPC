import { StatusDot, STATUS_TEXT_COLOR, type StatusDotVariant } from "@/components/status-dot";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  sublabel?: string;
  variant?: StatusDotVariant;
  /** `lead`: the tile the dashboard's asymmetric layout is giving visual
   * priority to (see "leading metric" logic in dashboard-page.tsx) — bigger
   * number, a left accent bar, more padding. `default` otherwise. */
  size?: "default" | "lead";
}

/**
 * A single count tile (Scheduled / Delayed / At Risk / Parts Short) — the
 * same dot-plus-label treatment as KpiTile (kpi-tile.tsx), not the
 * KPI-specific null/no-data handling, since a count of 0 here (e.g. "0
 * Delayed") is a real, meaningful answer, never "no data yet." Kept as a
 * separate component from KpiTile rather than merged, since that
 * distinction — 0 is always meaningful here vs. sometimes-a-placeholder
 * there — is a real behavioral difference, not just a style one. Set in
 * Space Grotesk, not monospace — see kpi-tile.tsx's identical note; mono is
 * for tabular/list contexts only now, never a large standalone number.
 */
export function StatTile({ label, value, sublabel, variant = "info", size = "default" }: StatTileProps) {
  const isLead = size === "lead";
  return (
    <div
      className={cn(
        "rounded-md border border-surface-border bg-surface-sunken",
        isLead ? "border-l-[3px] px-4 py-3.5" : "px-3.5 py-2.5",
      )}
      style={isLead ? { borderLeftColor: `var(--color-${variantToBorderVar(variant)})` } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <StatusDot variant={variant} />
        <p className={cn("font-medium tracking-wide text-ink-muted uppercase", isLead ? "text-xs" : "text-xs")}>
          {label}
        </p>
      </div>
      <p
        className={cn(
          "font-display leading-none font-bold tabular-nums",
          isLead ? "mt-2 text-4xl" : "mt-1 text-2xl",
          STATUS_TEXT_COLOR[variant],
        )}
      >
        {value}
      </p>
      {sublabel && <p className={cn("text-ink-muted", isLead ? "mt-1.5 text-xs" : "mt-1 text-xs")}>{sublabel}</p>}
    </div>
  );
}

function variantToBorderVar(variant: StatusDotVariant): string {
  if (variant === "amber") return "signal-amber";
  if (variant === "faint") return "surface-border";
  return `status-${variant}`;
}
