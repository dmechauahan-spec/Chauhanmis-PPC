import { FileX } from "lucide-react";
import { useOrderClosureSummary } from "../use-orders";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDecimal } from "@/lib/format";

/**
 * Order detail page panel (Client Flow Part 4B) — only ever mounted once
 * the order is actually Closed (see order-detail-page.tsx). Read-only: the
 * summary is captured automatically by the backend on the -> Closed
 * transition, never edited here.
 */
export function ClosureSummaryPanel({ orderId }: { orderId: string }) {
  const { data: summary, isPending, isError, error } = useOrderClosureSummary(orderId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Closure Summary</CardTitle>
        <CardDescription>Captured automatically when this order was closed</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <p className="text-sm text-status-critical">{apiErrorMessage(error, "Couldn't load the closure summary.")}</p>
        ) : !summary ? (
          // Shouldn't happen — the backend auto-captures this on every ->
          // Closed transition — but handled gracefully rather than crashing
          // in case a pre-Part-4 order was closed before this existed.
          <EmptyState
            icon={FileX}
            title="Summary not available"
            description="No closure summary was captured for this order."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Metric label="Ordered" value={formatDecimal(summary.totalOrderedQty, 0)} />
              <Metric label="Produced" value={formatDecimal(summary.totalProducedQty, 0)} />
              <Metric label="QC Passed" value={formatDecimal(summary.totalQcPassedQty, 0)} />
              <Metric label="Rejected" value={formatDecimal(summary.totalRejectedQty, 0)} />
              <Metric label="Rework" value={formatDecimal(summary.totalReworkQty, 0)} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Metric
                label="Planned Completion"
                value={summary.plannedCompletionDate ? formatDate(summary.plannedCompletionDate) : "—"}
              />
              <Metric label="Actual Completion" value={formatDate(summary.actualCompletionDate)} />
              <DelayMetric delayDays={summary.delayDays} />
            </div>
            {(summary.delayReason || summary.finalRemarks) && (
              <div className="flex flex-col gap-3">
                {summary.delayReason && (
                  <div>
                    <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Delay Reason</p>
                    <p className="mt-1 text-sm text-ink-primary">{summary.delayReason}</p>
                  </div>
                )}
                {summary.finalRemarks && (
                  <div>
                    <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Final Remarks</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-ink-primary">{summary.finalRemarks}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Signed: positive = late, negative = early, null = no schedule existed to
// compare against — spelled out in words (not just a signed number) so
// early-vs-late is unambiguous at a glance, matching the "honest gap"
// convention used for noDataLogged elsewhere.
function DelayMetric({ delayDays }: { delayDays: number | null }) {
  let value = "—";
  let colorClass = "text-ink-primary";
  if (delayDays != null) {
    if (delayDays > 0) {
      value = `${formatDecimal(delayDays, 0)} day${delayDays === 1 ? "" : "s"} late`;
      colorClass = "text-status-critical";
    } else if (delayDays < 0) {
      const early = Math.abs(delayDays);
      value = `${formatDecimal(early, 0)} day${early === 1 ? "" : "s"} early`;
      colorClass = "text-status-success";
    } else {
      value = "On time";
      colorClass = "text-status-success";
    }
  }
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Delay</p>
      <p className={`mt-1 font-mono text-sm tabular-nums ${colorClass}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-ink-primary">{value}</p>
    </div>
  );
}
