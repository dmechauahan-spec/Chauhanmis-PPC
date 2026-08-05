import * as React from "react";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/format";

export interface GaugeThresholds {
  /** value >= this -> success (green) zone */
  goodAt: number;
  /** value < this -> critical (red) zone */
  criticalBelow: number;
}

export type GaugeZone = "critical" | "caution" | "success" | "faint";

// The single source of truth for "which of the three bands is this value
// in" — both gaugeZoneFor (below) and the arc-drawing zoneEdges in the
// component itself key off this so the value text color can never disagree
// with the zone the needle is actually pointing at.
function zoneOf(value: number, thresholds: GaugeThresholds): Exclude<GaugeZone, "faint"> {
  if (value >= thresholds.goodAt) return "success";
  if (value < thresholds.criticalBelow) return "critical";
  return "caution";
}

/** Same 3-tier read as kpi-thresholds.ts's kpiVariant, but named for the
 * gauge's actual red/amber/green zones rather than status-dot's
 * critical/info/success vocabulary — the two are deliberately different
 * visual languages (see index.css's --color-gauge-caution comment for why
 * this isn't just kpiVariant renamed). */
export function gaugeZoneFor(value: number | null, thresholds: GaugeThresholds): GaugeZone {
  return value === null ? "faint" : zoneOf(value, thresholds);
}

const ZONE_TEXT_CLASS: Record<GaugeZone, string> = {
  critical: "text-status-critical",
  caution: "text-gauge-caution",
  success: "text-status-success",
  faint: "text-ink-faint",
};

const ZONE_FILL_VAR: Record<Exclude<GaugeZone, "faint">, string> = {
  critical: "var(--color-status-critical)",
  caution: "var(--color-gauge-caution)",
  success: "var(--color-status-success)",
};

// ---- Geometry — a fixed 200x116 viewBox scaled by CSS width, so "size"
// only has to change text sizing + wrapper max-width (see SIZE_CONFIG),
// never these numbers. ----
const CX = 100;
const CY = 104;
const ARC_RADIUS = 82;
const ARC_STROKE = 16;
const NEEDLE_LENGTH = 70;
const HUB_RADIUS = 7;
const REST_ANGLE_DEG = -90; // needle pointing left = value 0 / no-data rest position

function valueToTheta(value: number): number {
  return 180 - (Math.max(0, Math.min(100, value)) / 100) * 180;
}

function valueToNeedleDeg(value: number): number {
  return (Math.max(0, Math.min(100, value)) / 100) * 180 - 90;
}

function polarPoint(thetaDeg: number, radius: number): { x: number; y: number } {
  const rad = (thetaDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
}

/** An SVG arc path from `fromValue` to `toValue` (0-100, fromValue < toValue) along ARC_RADIUS. */
function zoneArcPath(fromValue: number, toValue: number): string {
  const start = polarPoint(valueToTheta(fromValue), ARC_RADIUS);
  const end = polarPoint(valueToTheta(toValue), ARC_RADIUS);
  return `M ${start.x} ${start.y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${end.x} ${end.y}`;
}

function tickAt(value: number): { x1: number; y1: number; x2: number; y2: number } {
  const theta = valueToTheta(value);
  const inner = polarPoint(theta, ARC_RADIUS - ARC_STROKE / 2 - 3);
  const outer = polarPoint(theta, ARC_RADIUS + ARC_STROKE / 2 + 3);
  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
}

interface SizeConfig {
  wrapperClassName: string;
  valueClassName: string;
  labelClassName: string;
  captionClassName: string;
  showTicks: boolean;
}

const SIZE_CONFIG: Record<"hero" | "sm", SizeConfig> = {
  hero: {
    wrapperClassName: "w-full max-w-[22rem]",
    // Responsive, not a flat text-5xl: "50.0%" is a single unbreakable
    // token, so at a squeezed column width (narrow viewport, or this app's
    // sidebar not collapsing on mobile — see dashboard-page.tsx notes) it
    // has nowhere to wrap and will overflow its card instead of shrinking,
    // unless the font itself steps down first.
    valueClassName: "text-4xl sm:text-5xl",
    labelClassName: "text-sm",
    captionClassName: "text-xs",
    showTicks: true,
  },
  sm: {
    wrapperClassName: "w-full max-w-[11rem]",
    // Same reasoning as hero's responsive value text, sized for a
    // different danger zone: three "sm" gauges share one row from the lg
    // breakpoint (1024px) up, and right at that boundary their column is
    // its narrowest relative to the value text — smaller than at any wider
    // viewport, where there's more room. text-lg fits that worst case;
    // text-2xl is safe again once xl (1280px) gives the row enough width
    // that the gauges have grown past their crunch point.
    valueClassName: "text-lg xl:text-2xl",
    labelClassName: "text-xs",
    captionClassName: "text-[0.65rem]",
    showTicks: false,
  },
};

export interface GaugeDialProps {
  label: string;
  /** `null` means "no underlying data for this range" — same convention as KpiTile. */
  value: number | null;
  thresholds: GaugeThresholds;
  size?: "hero" | "sm";
  /** Shown only when `value` is `null` — why there's nothing to show. */
  emptyReason?: string;
  /** Shown only when `value` isn't `null`. */
  contributingLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
}

/**
 * A semicircular instrument dial — the dashboard's hero metric visual,
 * replacing the flat KPI-tile-as-number-card pattern (see README "Design
 * System" / the dashboard redesign notes for why: real factory control
 * panels read as gauges, not SaaS stat cards). A needle sweeps to `value`
 * against a red/amber/green zone arc built from the same thresholds
 * kpi-thresholds.ts already defines — no new bands invented here.
 *
 * Needle motion is a CSS `transform` transition, not a JS animation loop —
 * which means it already respects `prefers-reduced-motion` for free via the
 * blanket `transition-duration: 0.001ms !important` rule in index.css (the
 * same mechanism signal-pulse/cell-flash/error-shake rely on), rather than
 * needing its own matchMedia check.
 */
export function GaugeDial({
  label,
  value,
  thresholds,
  size = "sm",
  emptyReason,
  contributingLabel,
  formatValue = (v) => formatPct(v),
  className,
}: GaugeDialProps) {
  const config = SIZE_CONFIG[size];
  const zone = gaugeZoneFor(value, thresholds);
  const targetDeg = value === null ? REST_ANGLE_DEG : valueToNeedleDeg(value);

  // Renders at REST_ANGLE_DEG on first paint, then nudges to targetDeg one
  // frame later — that's what gives the CSS transition something to
  // animate *from* on mount (a transition can't animate a value that never
  // changed). Re-running whenever targetDeg changes also gives the "on
  // data-change" sweep the spec asks for, for free — a refetch that moves
  // the value just re-triggers this same effect.
  const [needleDeg, setNeedleDeg] = React.useState(REST_ANGLE_DEG);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setNeedleDeg(targetDeg));
    return () => cancelAnimationFrame(raf);
  }, [targetDeg]);

  const zoneEdges: [number, number, Exclude<GaugeZone, "faint">][] =
    value === null
      ? []
      : [
          [0, thresholds.criticalBelow, "critical"],
          [thresholds.criticalBelow, thresholds.goodAt, "caution"],
          [thresholds.goodAt, 100, "success"],
        ].filter(([from, to]) => to > from) as [number, number, Exclude<GaugeZone, "faint">][];

  const needleColor = value === null ? "var(--color-ink-faint)" : "var(--color-signal-amber)";
  const displayValue = value === null ? "—" : formatValue(value);
  const accessibleLabel =
    value === null ? `${label}: no data` : `${label}: ${displayValue}, ${zoneOf(value, thresholds)} zone`;

  return (
    <div data-gauge={label} className={cn("flex min-w-0 flex-col items-center", config.wrapperClassName, className)}>
      <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label={accessibleLabel}>
        {value === null ? (
          <path
            d={zoneArcPath(0, 100)}
            fill="none"
            stroke="var(--color-surface-border)"
            strokeWidth={ARC_STROKE}
            strokeLinecap="round"
          />
        ) : (
          zoneEdges.map(([from, to, zoneName]) => (
            <path
              key={zoneName}
              d={zoneArcPath(from, to)}
              fill="none"
              stroke={ZONE_FILL_VAR[zoneName]}
              strokeWidth={ARC_STROKE}
              strokeLinecap="butt"
            />
          ))
        )}

        {config.showTicks &&
          [0, thresholds.criticalBelow, thresholds.goodAt, 100].map((v) => {
            const t = tickAt(v);
            return (
              <line
                key={v}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke="var(--color-surface-base)"
                strokeWidth={2}
              />
            );
          })}

        {/* Needle — pre-drawn pointing straight up (toward the 50% / top
            position), then rotated by CSS transform so 0deg == 50%,
            -90deg == 0%, +90deg == 100% (see valueToNeedleDeg). */}
        <g
          style={{
            transform: `rotate(${needleDeg}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: "transform 900ms cubic-bezier(0.34, 1.15, 0.64, 1)",
          }}
        >
          <line
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - NEEDLE_LENGTH}
            stroke={needleColor}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
        <circle cx={CX} cy={CY} r={HUB_RADIUS} fill={needleColor} />
        <circle cx={CX} cy={CY} r={HUB_RADIUS - 3} fill="var(--color-surface-raised)" />
      </svg>

      <div className="-mt-2 flex flex-col items-center text-center">
        <p className={cn("font-display font-bold leading-none", config.valueClassName, ZONE_TEXT_CLASS[zone])}>
          {displayValue}
        </p>
        <p className={cn("mt-1.5 font-medium tracking-wide text-ink-muted uppercase", config.labelClassName)}>
          {label}
        </p>
        {value === null
          ? emptyReason && <p className={cn("mt-0.5 text-ink-faint", config.captionClassName)}>{emptyReason}</p>
          : contributingLabel && (
              <p className={cn("mt-0.5 text-ink-muted", config.captionClassName)}>{contributingLabel}</p>
            )}
      </div>
    </div>
  );
}
