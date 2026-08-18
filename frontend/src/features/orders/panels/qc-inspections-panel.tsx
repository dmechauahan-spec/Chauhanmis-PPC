import { Link } from "react-router";
import { Microscope, Plus } from "lucide-react";
import { useQcInspectionSummary } from "@/features/qc/use-qc-inspections";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatDecimal, formatPct } from "@/lib/format";

/**
 * Order detail page panel (Client Flow Part 3) — cumulative QC inspection
 * results for this order, with acceptedProductionQty (== totalPassedQty)
 * called out explicitly since it's the client's "Accepted Production"
 * concept that matters to the order's overall story. `canAct` passed down
 * from the page, same convention as ProductionPlanPanel (Part 2).
 */
export function QcInspectionsPanel({ orderId, canAct }: { orderId: string; canAct: boolean }) {
  const { data: summary, isPending, isError } = useQcInspectionSummary(orderId);

  const hasInspections = !!summary && summary.totalProducedQty > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>QC Inspections</CardTitle>
          <CardDescription>Cumulative daily inspection results for this order</CardDescription>
        </div>
        {canAct && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/qc-inspections/new?orderId=${encodeURIComponent(orderId)}`}>
              <Plus />
              New Inspection
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : isError || !summary ? (
          <p className="text-sm text-status-critical">Couldn&apos;t load QC inspection data.</p>
        ) : !hasInspections ? (
          <EmptyState
            icon={Microscope}
            title="No QC inspections recorded yet"
            description="Once daily inspections are logged for this order, cumulative pass/reject/rework totals show up here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Accepted Production" value={formatDecimal(summary.acceptedProductionQty, 0)} highlight />
              <Metric label="Rejected" value={formatDecimal(summary.totalRejectedQty, 0)} />
              <Metric label="Rework" value={formatDecimal(summary.totalReworkQty, 0)} />
              <Metric
                label="Pass Rate"
                value={summary.overallPassRatePct === null ? "—" : formatPct(summary.overallPassRatePct)}
              />
            </div>
            <Link
              to={`/qc-inspections?orderId=${encodeURIComponent(orderId)}`}
              className="self-start text-xs text-signal-amber hover:underline"
            >
              View all inspections for this order →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className={`mt-1 font-mono text-sm tabular-nums ${highlight ? "text-signal-amber" : "text-ink-primary"}`}>{value}</p>
    </div>
  );
}
