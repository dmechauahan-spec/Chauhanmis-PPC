import * as React from "react";
import { PlayCircle, TriangleAlert, CircleCheck, CircleX, Info } from "lucide-react";
import { useRunScheduling } from "./use-scheduling";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import type { RunSchedulingResult, UnscheduledReason } from "@/types/api";

const UNSCHEDULED_REASON_TEXT: Record<UnscheduledReason, string> = {
  no_compatible_line: "No active line is compatible with this order's product type.",
  no_feasible_line: "No compatible line currently has enough available workers or capacity to take this order.",
};

/**
 * Preview-then-confirm is structural, not a UX convention that could be
 * bypassed: the only way to reach the real (dryRun: false) call is the
 * "Confirm and Run" button rendered inside this dialog's own body, which
 * only exists once a dry-run preview has already loaded successfully. The
 * outer trigger button itself only ever opens the dialog and kicks off the
 * dry-run — it never calls the endpoint with dryRun: false.
 */
export function RunSchedulingDialog() {
  const [open, setOpen] = React.useState(false);
  const [committed, setCommitted] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const runScheduling = useRunScheduling();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCommitted(false);
      setConfirming(false);
      runScheduling.mutate({ dryRun: true });
    }
  }

  function handleConfirm() {
    setConfirming(true);
    runScheduling.mutate(
      { dryRun: false },
      {
        onSuccess: () => setCommitted(true),
        onSettled: () => setConfirming(false),
      },
    );
  }

  const result = runScheduling.data;
  const isPreviewLoading = runScheduling.isPending && !confirming;
  const nothingToConfirm = !result || result.scheduled.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg">
          <PlayCircle />
          Run Scheduling
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{committed ? "Scheduling run complete" : "Run Scheduling — Preview"}</DialogTitle>
          <DialogDescription>
            {committed
              ? "The results below have been saved."
              : "Nothing has been written yet — review, then confirm to commit."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isPreviewLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {runScheduling.isError && (
            <Alert variant="critical">
              <TriangleAlert />
              <AlertTitle>Couldn&apos;t run the scheduler</AlertTitle>
              <AlertDescription>{apiErrorMessage(runScheduling.error)}</AlertDescription>
            </Alert>
          )}

          {result && !isPreviewLoading && <RunResultView result={result} />}
        </DialogBody>

        <DialogFooter>
          {committed ? (
            <Button onClick={() => setOpen(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={isPreviewLoading || confirming || nothingToConfirm}>
                {confirming ? "Running…" : "Confirm and Run"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunResultView({ result }: { result: RunSchedulingResult }) {
  if (result.summary.totalEligible === 0) {
    return (
      <EmptyState
        icon={Info}
        title="No orders are currently eligible for scheduling"
        description="An order must be Clear to Build and not yet scheduled to be picked up by a run."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="neutral">{result.summary.totalEligible} eligible</Badge>
        <Badge variant="success">{result.summary.scheduledCount} scheduled</Badge>
        <Badge variant="critical">{result.summary.unscheduledCount} not scheduled</Badge>
        {result.summary.failedCount > 0 && (
          <Badge variant="critical">{result.summary.failedCount} failed to save</Badge>
        )}
      </div>

      {result.failed.length > 0 && (
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>{result.failed.length} order(s) failed to save</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 flex flex-col gap-0.5">
              {result.failed.map((f) => (
                <li key={f.orderId}>
                  <span className="font-mono">{f.orderId}</span>: {f.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {result.scheduled.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
            <CircleCheck className="size-3.5 text-status-success" />
            Would schedule ({result.scheduled.length})
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Daily Output</TableHead>
                <TableHead>Est. End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.scheduled.map((a) => (
                <TableRow key={a.orderId}>
                  <TableCell className="font-mono text-signal-amber">{a.orderId}</TableCell>
                  <TableCell className="font-mono">{a.lineName}</TableCell>
                  <TableCell numeric>{formatNumber(Math.round(a.dailyOutput))}</TableCell>
                  <TableCell className="font-mono text-ink-muted">{formatDate(a.estEndDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {result.unscheduled.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
            <CircleX className="size-3.5 text-status-critical" />
            Would not schedule ({result.unscheduled.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.unscheduled.map((u) => (
              <li
                key={u.orderId}
                className="rounded-sm border border-surface-border bg-surface-sunken px-3 py-2 text-sm"
              >
                <span className="font-mono text-ink-primary">{u.orderId}</span>
                <span className="text-ink-muted"> — {UNSCHEDULED_REASON_TEXT[u.reason]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
