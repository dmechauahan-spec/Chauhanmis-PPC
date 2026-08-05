import { RefreshCw, TriangleAlert, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useDashboardOverview, getOverviewDateRange } from "./use-dashboard-overview";
import { StatTile } from "./stat-tile";
import { MiniBarChart } from "./mini-bar-chart";
import { GaugeDial } from "@/components/gauge-dial";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { PR_STATUS_BADGE_VARIANT } from "@/features/purchase-requisitions/pr-badges";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber, formatPct, formatShortDate } from "@/lib/format";
import { fillDailyProductionSeries } from "@/lib/date-series";
import { KPI_THRESHOLDS } from "@/lib/kpi-thresholds";
import { cn } from "@/lib/utils";
import type { ManagementMetrics, MaterialsHealth, PlanningHealth, PrStatus, ProductionPeriodRow } from "@/types/api";

// Role-agnostic by construction: DashboardPage reads only from
// useDashboardOverview()'s response shape, never from the logged-in user's
// role. Every role that can reach /dashboard (Admin, StoreManager,
// ProductionManager — see nav-config.ts) renders through this exact
// component; the backend varies what's IN the response, not which
// component renders it. So the gauge cluster / bento layout below applies
// to all three automatically, with nothing role-specific to duplicate.
export function DashboardPage() {
  const { data, isPending, isError, error, refetch, isFetching } = useDashboardOverview();

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Overview</h1>
          <p className="text-sm text-ink-muted">Last 30 days, refreshed every minute</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {isError && (
        <Alert variant="critical" className="mb-6">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load the dashboard</AlertTitle>
          <AlertDescription>
            {apiErrorMessage(error, "The backend may be unreachable.")}{" "}
            <button onClick={() => refetch()} className="underline underline-offset-2">
              Try again
            </button>
          </AlertDescription>
        </Alert>
      )}

      {isPending && <DashboardSkeleton />}

      {data && (
        // A genuine bento grid — mixed cell sizes, not a uniform N-column
        // repeat. 12 columns on lg: gauge cluster/planning split 8/4 in row
        // one, production/materials split 5/7 in row two. Two different
        // ratios in two rows is what makes this read as composed rather
        // than a repeating template.
        <div data-testid="dashboard-bento-grid" className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <GaugeClusterCard management={data.management} className="lg:col-span-8" />
          <PlanningCard planning={data.planning} className="lg:col-span-4" />
          <ProductionCard production={data.production} className="lg:col-span-5" />
          <MaterialsCard materials={data.materials} className="lg:col-span-7" />
        </div>
      )}
    </div>
  );
}

/**
 * The hero element — see GaugeDial's own doc comment for why this replaced
 * the four-equal-tiles KPI row. OEE gets the "hero" gauge (biggest visual
 * element on the page, per the design brief: it's the single most
 * important factory-health number); the other three sit beside it as
 * visibly smaller "sm" gauges, a real size hierarchy instead of four
 * identical cards. blueprint-grid-hero is the dashboard's stronger
 * schematic-grid texture (see index.css) — actually perceptible behind the
 * cluster, unlike the login page's near-invisible original.
 *
 * The backend's response distinguishes "no underlying data" from a real
 * computed 0 for all four metrics, just not uniformly at the top level: OEE
 * and Capacity Utilization are already `number | null` (null = no
 * computable data — see ppc-backend's oeeCalculator.ts). Production
 * Efficiency and Delivery Performance are always a plain number (0 when
 * there's nothing to average/rate over), but `detail.productionEfficiency
 * .lineCount` / `detail.deliveryPerformance.totalCount` report exactly how
 * many things contributed — 0 of either means "no data," same as a null
 * would.
 */
function GaugeClusterCard({ management, className }: { management: ManagementMetrics; className?: string }) {
  const logCount = management.detail.oee.logCount;
  const lineCount = management.detail.productionEfficiency.lineCount;
  const deliveryCount = management.detail.deliveryPerformance.totalCount;

  const productionEfficiencyValue = lineCount > 0 ? management.productionEfficiencyPct : null;
  const deliveryValue = deliveryCount > 0 ? management.deliveryPerformancePct : null;

  return (
    // No overflow-hidden here: background-image already clips to the
    // card's own rounded corners on its own (CSS default), and adding
    // overflow-hidden as a belt-and-suspenders for the texture had the side
    // effect of silently clipping the hero gauge's value text at narrow
    // widths instead of letting it visibly shrink/overflow where you'd
    // notice and fix it.
    <Card className={cn("blueprint-grid-hero", className)}>
      <CardHeader>
        <CardTitle>Factory Health</CardTitle>
        <CardDescription>The four headline management metrics, last 30 days</CardDescription>
      </CardHeader>
      {/* lg:grid with minmax(0, Nfr) columns, NOT lg:flex-row — the
          previous flex version gave the hero gauge shrink-0 (so it always
          held its full max-width) while the secondary group had ordinary
          flex-shrink. Right at the lg breakpoint (~1024px), there isn't
          enough room for hero-at-full-width + 3 legible secondary gauges,
          and shrink-0 meant the secondary group absorbed the entire
          shortfall — collapsing toward zero width and making its
          unbreakable "57.3%"-style text visually overlap between gauges.
          minmax(0, fr) columns can never be starved like that: each
          column's floor is 0, not "whatever's left after the other side
          took what it wanted," so both sides compress together,
          proportionally, at every width. See GaugeDial's own max-w cap for
          why they still stop growing once there's ample space (1440px+
          looks identical to before). */}
      <CardContent
        data-testid="gauge-cluster-row"
        className="flex flex-col items-center gap-8 py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-center lg:gap-6 xl:gap-10"
      >
        <GaugeDial
          label="OEE"
          value={management.oeePct}
          thresholds={KPI_THRESHOLDS.oee}
          size="hero"
          emptyReason="No production logs in this range"
          contributingLabel={`${logCount} log${logCount === 1 ? "" : "s"}`}
          className="min-w-0 justify-self-center"
        />
        {/* A strict grid, not flex-wrap — each gauge shrinks to fit its
            column rather than the row unpredictably wrapping to a
            single-file stack when the card is narrower than 3 full-size
            gauges (see GaugeDial's max-w cap for the size it shrinks from).
            Single column below sm: at phone widths three gauges across has
            no room to be legible (labels/values collide), so this drops to
            one full-width gauge per row instead of shrinking them further.
            lg:max-w-none on each gauge below (not a flat max-w-none): that
            override exists so these three can each fill their grid column
            at the DESKTOP 3-across layout — applied unscoped, it also
            stripped their own "sm" size cap on mobile's single-column
            stack, making them render exactly as large as the hero gauge
            and losing the intended hero/secondary hierarchy there. Scoping
            it to lg: lets them keep their real (smaller) max-width below
            that breakpoint. */}
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          <GaugeDial
            label="Capacity Utilization"
            value={management.capacityUtilizationPct}
            thresholds={KPI_THRESHOLDS.capacityUtilization}
            size="sm"
            emptyReason="No output data in this range"
            contributingLabel={`${logCount} log${logCount === 1 ? "" : "s"}`}
            className="lg:max-w-none"
          />
          <GaugeDial
            label="Production Efficiency"
            value={productionEfficiencyValue}
            thresholds={KPI_THRESHOLDS.productionEfficiency}
            size="sm"
            emptyReason="No line output in this range"
            contributingLabel={`${lineCount} line${lineCount === 1 ? "" : "s"}`}
            className="lg:max-w-none"
          />
          <GaugeDial
            label="Delivery Performance"
            value={deliveryValue}
            thresholds={KPI_THRESHOLDS.deliveryPerformance}
            size="sm"
            emptyReason="No completed orders in this range"
            contributingLabel={`${deliveryCount} order${deliveryCount === 1 ? "" : "s"}`}
            className="lg:max-w-none"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ProductionCard({ production, className }: { production: ProductionPeriodRow[]; className?: string }) {
  // The backend only returns a row for days with an actual log entry (see
  // date-series.ts) — zero-fill the requested range here so the chart shows
  // one bar per calendar day. Sums/averages below are unaffected: zero-qty
  // filler days don't change totalOutput/totalGood, and their null
  // avgAttendancePct is already excluded by the existing null-filter.
  const { dateFrom, dateTo } = getOverviewDateRange();
  const dailySeries = fillDailyProductionSeries(production, dateFrom, dateTo);

  const totalOutput = production.reduce((sum, p) => sum + p.totalOutputQty, 0);
  const totalGood = production.reduce((sum, p) => sum + p.totalGoodQty, 0);
  const attendanceValues = production.map((p) => p.avgAttendancePct).filter((v): v is number => v !== null);
  const avgAttendance =
    attendanceValues.length > 0 ? attendanceValues.reduce((a, b) => a + b, 0) / attendanceValues.length : null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Production Output</CardTitle>
        <CardDescription>Daily total output, this range</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MiniBarChart
          data={dailySeries.map((p) => ({ label: formatShortDate(p.periodLabel), value: p.totalOutputQty }))}
          formatValue={formatNumber}
        />
        <div className="grid grid-cols-3 gap-2 border-t border-surface-border pt-4">
          <MiniStat label="Total Output" value={formatNumber(totalOutput)} />
          <MiniStat label="Good Units" value={formatNumber(totalGood)} />
          <MiniStat label="Avg Attendance" value={formatPct(avgAttendance)} />
        </div>
      </CardContent>
    </Card>
  );
}

function PlanningCard({ planning, className }: { planning: PlanningHealth; className?: string }) {
  const { scheduledCount, delayedCount, atRiskCount } = planning;

  // Break the "three identical tiles" symmetry: whichever concerning count
  // (Delayed, At Risk) is larger gets the big "lead" tile — that's the
  // number that actually needs a StoreManager/ProductionManager's
  // attention right now. An all-clear board (both zero) lets Scheduled
  // lead instead, so the layout never looks broken by promoting a zero to
  // the headline slot.
  const leader: "delayed" | "atRisk" | "scheduled" =
    delayedCount === 0 && atRiskCount === 0 ? "scheduled" : delayedCount >= atRiskCount ? "delayed" : "atRisk";

  // Scheduled = info and At Risk/Delayed = critical match the design
  // brief's own worked examples for these tokens exactly ("Scheduled,
  // neutral informational states" / "RM Shortage, At Risk, errors"). At
  // Risk previously used amber, which the brief reserves strictly for
  // actions/emphasis, not state — corrected in an earlier pass since At
  // Risk is a state, same as Delayed.
  const tiles = {
    scheduled: <StatTile label="Scheduled" value={formatNumber(scheduledCount)} variant="info" />,
    delayed: <StatTile label="Delayed" value={formatNumber(delayedCount)} variant="critical" />,
    atRisk: <StatTile label="At Risk" value={formatNumber(atRiskCount)} variant="critical" />,
  };
  const leadTile = {
    scheduled: (
      <StatTile
        label="Scheduled"
        value={formatNumber(scheduledCount)}
        variant="info"
        size="lead"
        sublabel="All clear — nothing delayed or at risk"
      />
    ),
    delayed: <StatTile label="Delayed" value={formatNumber(delayedCount)} variant="critical" size="lead" />,
    atRisk: <StatTile label="At Risk" value={formatNumber(atRiskCount)} variant="critical" size="lead" />,
  }[leader];
  const otherKeys = (["scheduled", "delayed", "atRisk"] as const).filter((k) => k !== leader);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Planning Health</CardTitle>
        <CardDescription>Orders in flight, right now</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div data-testid="planning-tiles-row" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">{leadTile}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
            {otherKeys.map((k) => (
              <div key={k}>{tiles[k]}</div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-surface-border bg-surface-sunken px-4 py-3">
          <p className="mb-2.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
            Every order moves through this pipeline
          </p>
          {/* compact, not full — PipelineStepper's own size doc calls
              compact out for exactly this context ("table rows /
              dashboard"). This card is a narrow lg:col-span-4 sidebar
              column, not a detail-page-width layout: full's 7 text labels
              have nowhere near enough room here and — even after fixing
              the underlying max-width/wrap bug (see pipeline-stepper.tsx)
              — degrade to unreadable single-letter-per-line stacks rather
              than a real overflow. Dots-only sidesteps the problem instead
              of just making the failure mode prettier. */}
          <PipelineStepper currentStage="Running" size="compact" />
          <p className="mt-2.5 text-xs text-ink-faint">
            Illustrative — per-order pipelines land on the Orders module in a later phase.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialsCard({ materials, className }: { materials: MaterialsHealth; className?: string }) {
  const prEntries = Object.entries(materials.procurementStatusBreakdown) as [PrStatus, number][];
  const prTotal = Math.max(1, prEntries.reduce((sum, [, count]) => sum + count, 0));

  // Same "let the concerning number lead" idea as PlanningCard, applied to
  // a 3-column split instead of a big-tile-plus-small-tiles one: when
  // there's an actual shortage, Shortage Impact gets the widest column and
  // a "lead"-sized number; when the board is clean, Purchase Requisitions
  // (the thing most likely to have something worth looking at day-to-day)
  // takes the extra width instead. Either way it's a 2/x/y split, never an
  // even three-across.
  const hasShortage = materials.rmShortagePartsCount > 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Material Health</CardTitle>
        <CardDescription>Clear-to-build status and the purchase requisition pipeline</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-7">
          <div className="flex flex-col gap-2 lg:col-span-2">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Clear-to-Build</p>
            <div className="flex flex-col gap-1.5">
              <CtbRow icon={ShieldCheck} label="Clear to Build" value={materials.ctbBreakdown.clearCount} variant="success" />
              <CtbRow icon={ShieldAlert} label="RM Shortage" value={materials.ctbBreakdown.shortageCount} variant="critical" />
              <CtbRow icon={ShieldQuestion} label="Never Checked" value={materials.ctbBreakdown.neverCheckedCount} variant="neutral" />
            </div>
          </div>

          <div className={cn("flex flex-col gap-2", hasShortage ? "lg:col-span-3" : "lg:col-span-1")}>
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Shortage Impact</p>
            <StatTile
              label="Parts Short"
              value={formatNumber(materials.rmShortagePartsCount)}
              variant="critical"
              size={hasShortage ? "lead" : "default"}
            />
          </div>

          <div className={cn("flex flex-col gap-2", hasShortage ? "lg:col-span-2" : "lg:col-span-4")}>
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Purchase Requisitions</p>
            <div className="flex flex-col gap-1.5">
              {prEntries.map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  <Badge variant={PR_STATUS_BADGE_VARIANT[status]} className="w-20 justify-center">
                    {status}
                  </Badge>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-accent-teal/70"
                      style={{ width: `${(count / prTotal) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-xs tabular-nums text-ink-muted">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CtbRow({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  variant: "success" | "critical" | "neutral";
}) {
  const color = variant === "success" ? "text-status-success" : variant === "critical" ? "text-status-critical" : "text-ink-muted";
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border border-surface-border bg-surface-sunken px-3 py-2">
      <span className={`flex items-center gap-2 text-sm ${color}`}>
        <Icon className="size-4" strokeWidth={1.85} />
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-ink-primary">{formatNumber(value)}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[0.65rem] font-medium tracking-wide text-ink-faint uppercase">{label}</p>
      <p className="font-mono text-sm tabular-nums text-ink-primary">{value}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <Skeleton className="h-72 lg:col-span-8" />
      <Skeleton className="h-72 lg:col-span-4" />
      <Skeleton className="h-64 lg:col-span-5" />
      <Skeleton className="h-64 lg:col-span-7" />
    </div>
  );
}
