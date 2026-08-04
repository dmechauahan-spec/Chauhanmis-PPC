import { StatusDot, STATUS_TEXT_COLOR, type StatusDotVariant } from "@/components/status-dot";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  sublabel?: string;
  variant?: StatusDotVariant;
}

/**
 * A single count tile (Scheduled / Delayed / At Risk / Parts Short) — the
 * same dot-plus-label treatment as KpiTile (kpi-tile.tsx), not the
 * KPI-specific null/no-data handling, since a count of 0 here (e.g. "0
 * Delayed") is a real, meaningful answer, never "no data yet." Kept as a
 * separate component from KpiTile rather than merged, since that
 * distinction — 0 is always meaningful here vs. sometimes-a-placeholder
 * there — is a real behavioral difference, not just a style one. Set in
 * monospace per the app-wide numeric-data convention.
 */
export function StatTile({ label, value, sublabel, variant = "info" }: StatTileProps) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <div className="flex items-center gap-1.5">
        <StatusDot variant={variant} />
        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      </div>
      <p className={cn("mt-1 font-mono text-2xl leading-none font-medium tabular-nums", STATUS_TEXT_COLOR[variant])}>
        {value}
      </p>
      {sublabel && <p className="mt-1 text-xs text-ink-muted">{sublabel}</p>}
    </div>
  );
}
