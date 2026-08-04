import { StatusDot } from "@/components/status-dot";
import { cn } from "@/lib/utils";

/**
 * Signed slack days with a StatusDot, not just a color/minus-sign — a
 * negative value (behind schedule) needs to read as unmistakably different
 * from a positive one at a glance, not rely on someone noticing a "-".
 */
export function SlackDays({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="font-mono text-sm text-ink-faint">—</span>;
  }
  const isNegative = days < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-sm tabular-nums",
        isNegative ? "text-status-critical" : "text-ink-primary",
      )}
    >
      <StatusDot variant={isNegative ? "critical" : "success"} />
      {days > 0 ? `+${days}` : days}
    </span>
  );
}
