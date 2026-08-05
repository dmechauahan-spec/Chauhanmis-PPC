import { StatusDot, STATUS_TEXT_COLOR, type StatusDotVariant } from "@/components/status-dot";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/format";

interface KpiTileProps {
  label: string;
  /** `null` means "no underlying data for this range" — distinct from a real computed 0. */
  value: number | null;
  variant: StatusDotVariant;
  /** Shown only when `value` is `null` — why there's nothing to show. */
  emptyReason?: string;
  /** Shown only when `value` isn't `null` — the freed-up space from dropping the icon box goes to real context, not just whitespace. */
  contributingLabel?: string;
}

/**
 * The four headline management-metric tiles. No icon-in-a-box — a plain
 * status dot (same visual language as the pipeline stepper's dots, see
 * status-dot.tsx) next to the label carries the semantic color instead. See
 * README "Design System" for why the icon-in-a-box pattern was removed.
 */
export function KpiTile({ label, value, variant, emptyReason, contributingLabel }: KpiTileProps) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <div className="flex items-center gap-1.5">
        <StatusDot variant={variant} />
        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      </div>

      <p
        className={cn(
          // Space Grotesk, not JetBrains Mono — mono is reserved for
          // tabular/list contexts (table cells, IDs, codes) now; a large
          // standalone metric value reads as a headline number, not data-
          // table content. See README "Design System" typography rule.
          "mt-1 font-display text-2xl leading-none font-bold tabular-nums",
          STATUS_TEXT_COLOR[variant],
        )}
      >
        {value === null ? "—" : formatPct(value)}
      </p>

      {value === null
        ? emptyReason && <p className="mt-1 text-xs text-ink-faint">{emptyReason}</p>
        : contributingLabel && <p className="mt-1 text-xs text-ink-muted">{contributingLabel}</p>}
    </div>
  );
}
