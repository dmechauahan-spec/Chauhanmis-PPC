import { RefreshCw, TriangleAlert, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useDashboardOverview } from "./use-dashboard-overview";
import { StatTile } from "./stat-tile";
import { KpiTile } from "./kpi-tile";
import { MiniBarChart } from "./mini-bar-chart";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { PR_STATUS_BADGE_VARIANT } from "@/features/purchase-requisitions/pr-badges";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber, formatPct, formatShortDate } from "@/lib/format";
import { KPI_THRESHOLDS, kpiVariant } from "@/lib/kpi-thresholds";
import type { ManagementMetrics, MaterialsHealth, PlanningHealth, PrStatus, ProductionPeriodRow } from "@/types/api";

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
        <div className="flex flex-col gap-5">
          {/* Management metrics — the four headline KPIs */}
          <ManagementKpiRow management={data.management} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ProductionCard production={data.production} />
            <PlanningCard planning={data.planning} />
          </div>

          <MaterialsCard materials={data.materials} />
        </div>
      )}
    </div>
  );
}

/**
 * The backend's response distinguishes "no underlying data" from a real
 * computed 0 for all four metrics, just not uniformly at the top level:
 * OEE and Capacity Utilization are already `number | null` (null = no
 * computable data — see ppc-backend's oeeCalculator.ts). Production
 * Efficiency and Delivery Performance are always a plain number (0 when
 * there's nothing to average/rate over), but `detail.productionEfficiency
 * .lineCount` / `detail.deliveryPerformance.totalCount` report exactly how
 * many things contributed — 0 of either means "no data," same as a null
 * would. So this is a real backend-provided signal for all four, not a
 * frontend-only heuristic.
 */
function ManagementKpiRow({ management }: { management: ManagementMetrics }) {
  const logCount = management.detail.oee.logCount;
  const lineCount = management.detail.productionEfficiency.lineCount;
  const deliveryCount = management.detail.deliveryPerformance.totalCount;

  // Normalize all four to "value is null when there's no contributing
  // data" — OEE/Capacity Utilization already come this way from the
  // backend; Production Efficiency/Delivery Performance are derived here
  // from their real contributing-count fields (see comment above).
  const productionEfficiencyValue = lineCount > 0 ? management.productionEfficiencyPct : null;
  const deliveryValue = deliveryCount > 0 ? management.deliveryPerformancePct : null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        label="OEE"
        value={management.oeePct}
        variant={kpiVariant(management.oeePct, KPI_THRESHOLDS.oee)}
        emptyReason="No production logs in this range"
        contributingLabel={`${logCount} log${logCount === 1 ? "" : "s"}`}
      />
      <KpiTile
        label="Capacity Utilization"
        value={management.capacityUtilizationPct}
        variant={kpiVariant(management.capacityUtilizationPct, KPI_THRESHOLDS.capacityUtilization)}
        emptyReason="No output data in this range"
        contributingLabel={`${logCount} log${logCount === 1 ? "" : "s"}`}
      />
      <KpiTile
        label="Production Efficiency"
        value={productionEfficiencyValue}
        variant={kpiVariant(productionEfficiencyValue, KPI_THRESHOLDS.productionEfficiency)}
        emptyReason="No line output in this range"
        contributingLabel={`${lineCount} line${lineCount === 1 ? "" : "s"}`}
      />
      <KpiTile
        label="Delivery Performance"
        value={deliveryValue}
        variant={kpiVariant(deliveryValue, KPI_THRESHOLDS.deliveryPerformance)}
        emptyReason="No completed orders in this range"
        contributingLabel={`${deliveryCount} order${deliveryCount === 1 ? "" : "s"}`}
      />
    </div>
  );
}

function ProductionCard({ production }: { production: ProductionPeriodRow[] }) {
  const totalOutput = production.reduce((sum, p) => sum + p.totalOutputQty, 0);
  const totalGood = production.reduce((sum, p) => sum + p.totalGoodQty, 0);
  const attendanceValues = production.map((p) => p.avgAttendancePct).filter((v): v is number => v !== null);
  const avgAttendance =
    attendanceValues.length > 0 ? attendanceValues.reduce((a, b) => a + b, 0) / attendanceValues.length : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Output</CardTitle>
        <CardDescription>Daily total output vs. good units, this range</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MiniBarChart
          data={production.map((p) => ({ label: formatShortDate(p.periodLabel), value: p.totalOutputQty }))}
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

function PlanningCard({ planning }: { planning: PlanningHealth }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Planning Health</CardTitle>
        <CardDescription>Orders in flight, right now</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {/* Scheduled = info and At Risk = critical match the design
              brief's own worked examples for these tokens exactly
              ("Scheduled, neutral informational states" / "RM Shortage, At
              Risk, errors"). At Risk previously used amber, which the brief
              reserves strictly for actions/emphasis, not state — corrected
              here since At Risk is a state, same as Delayed. */}
          <StatTile label="Scheduled" value={formatNumber(planning.scheduledCount)} variant="info" />
          <StatTile label="Delayed" value={formatNumber(planning.delayedCount)} variant="critical" />
          <StatTile label="At Risk" value={formatNumber(planning.atRiskCount)} variant="critical" />
        </div>
        <div className="rounded-md border border-surface-border bg-surface-sunken px-4 py-3">
          <p className="mb-2.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
            Every order moves through this pipeline
          </p>
          <PipelineStepper currentStage="Running" size="full" />
          <p className="mt-2.5 text-xs text-ink-faint">
            Illustrative — per-order pipelines land on the Orders module in a later phase.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialsCard({ materials }: { materials: MaterialsHealth }) {
  const prEntries = Object.entries(materials.procurementStatusBreakdown) as [PrStatus, number][];
  const prTotal = Math.max(1, prEntries.reduce((sum, [, count]) => sum + count, 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material Health</CardTitle>
        <CardDescription>Clear-to-build status and the purchase requisition pipeline</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Clear-to-Build</p>
            <div className="flex flex-col gap-1.5">
              <CtbRow icon={ShieldCheck} label="Clear to Build" value={materials.ctbBreakdown.clearCount} variant="success" />
              <CtbRow icon={ShieldAlert} label="RM Shortage" value={materials.ctbBreakdown.shortageCount} variant="critical" />
              <CtbRow icon={ShieldQuestion} label="Never Checked" value={materials.ctbBreakdown.neverCheckedCount} variant="neutral" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Shortage Impact</p>
            <StatTile label="Parts Short" value={formatNumber(materials.rmShortagePartsCount)} variant="critical" />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Purchase Requisitions</p>
            <div className="flex flex-col gap-1.5">
              {prEntries.map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  <Badge variant={PR_STATUS_BADGE_VARIANT[status]} className="w-20 justify-center">
                    {status}
                  </Badge>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-status-info/70"
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
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[64px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}
