import { History } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { StatusDot, type StatusDotVariant } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";

// Generalized from Orders' original status-history-panel.tsx (Phase 2),
// which was hardcoded to Order's specific status enum/labels — Purchase
// Requisitions (Phase 7) need the identical timeline shape against a
// different status enum, so the raw-status -> label/color mapping is now
// caller-supplied instead of baked in.
export interface StatusHistoryEntry {
  id: number;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  changedAt: string;
  notes?: string | null;
}

interface StatusHistoryTimelineProps {
  entries: StatusHistoryEntry[] | undefined;
  isPending?: boolean;
  isError?: boolean;
  /** Raw status value -> display label. Defaults to the raw value itself. */
  statusLabel?: (status: string) => string;
  /** Raw newStatus -> dot color for that transition. Defaults to "info" for every status. */
  dotVariant?: (newStatus: string) => StatusDotVariant;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function StatusHistoryTimeline({
  entries,
  isPending = false,
  isError = false,
  statusLabel = (s) => s,
  dotVariant = () => "info",
  title = "Status History",
  emptyTitle = "No transitions yet",
  emptyDescription = "Nothing has changed status since this was created.",
}: StatusHistoryTimelineProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : isError || !entries ? (
          <p className="text-sm text-status-critical">Couldn&apos;t load status history.</p>
        ) : entries.length === 0 ? (
          <EmptyState icon={History} title={emptyTitle} description={emptyDescription} />
        ) : (
          <ol className="flex flex-col gap-3">
            {[...entries].reverse().map((entry) => (
              <li key={entry.id} className="flex items-start gap-2.5">
                <StatusDot variant={dotVariant(entry.newStatus)} className="mt-1.5" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="text-sm text-ink-primary">
                    {entry.oldStatus ? (
                      <>
                        <span className="text-ink-muted">{statusLabel(entry.oldStatus)}</span>
                        {" → "}
                        <span className="font-medium">{statusLabel(entry.newStatus)}</span>
                      </>
                    ) : (
                      <span className="font-medium">Created as {statusLabel(entry.newStatus)}</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(entry.changedAt)}
                    {entry.changedBy && ` · ${entry.changedBy}`}
                  </p>
                  {entry.notes && <p className="mt-0.5 text-xs text-ink-faint">{entry.notes}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
