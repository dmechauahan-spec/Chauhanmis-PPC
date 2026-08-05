interface MiniBarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (value: number) => string;
  ariaLabel?: string;
}

/**
 * A small, hand-built bar chart rather than a charting library — see
 * README "Design System": a generic chart library's default styling fights
 * this token system more than it helps for a handful of bars, and this
 * keeps the dependency footprint down for Phase 1.
 */
export function MiniBarChart({ data, height = 96, formatValue = String, ariaLabel = "Daily production output" }: MiniBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="text-sm text-ink-muted">No data in this range.</p>;
  }

  return (
    <div className="flex items-end gap-1" style={{ height }} role="img" aria-label={ariaLabel}>
      {data.map((point, i) => {
        const pct = Math.max(2, (point.value / max) * 100);
        return (
          <div key={i} className="group relative flex h-full flex-1 items-end">
            {/* accent-teal, not status-info — a chart fill is decorative
                data, not a state indicator, so it uses the secondary accent
                (index.css) rather than a status color. */}
            <div
              className="w-full rounded-t-sm bg-accent-teal/70 transition-colors group-hover:bg-accent-teal"
              style={{ height: `${pct}%` }}
            />
            <div
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-sm border border-surface-border
                bg-surface-raised px-2 py-1 text-xs whitespace-nowrap text-ink-primary opacity-0 shadow-lg shadow-black/40
                transition-opacity group-hover:opacity-100"
            >
              <span className="text-ink-muted">{point.label}</span>{" "}
              <span className="font-mono tabular-nums">{formatValue(point.value)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
