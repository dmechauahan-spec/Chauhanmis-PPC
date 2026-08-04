import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  RefreshCw,
  TriangleAlert,
  Clock,
  X,
} from "lucide-react";
import { useCtbCounts, useCtbDashboard, useRecheckAllCtb } from "./use-ctb";
import { StatTile } from "@/features/dashboard/stat-tile";
import { PriorityBadge } from "@/features/orders/order-badges";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import type { CtbDashboardRow, CtbStatusLabel, RecheckAllSummary } from "@/types/api";

// Mirrors ppc-backend's ctb.service.ts CTB_FRESHNESS_WINDOW_MS — a check
// older than this may not reflect current stock, since a GET within the
// window is served from the last stored evaluation rather than re-run live.
const CTB_FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

type CtbFilterValue = "all" | "Clear To Build" | "RM Shortage" | "NeverChecked";

export function CtbDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const ctbFilter = (searchParams.get("ctbStatus") as CtbFilterValue | null) ?? "all";

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  // The dashboard endpoint's ctbStatus filter only accepts the two real
  // statuses (see ctb.schema.ts) — there's no server-side way to ask for
  // "only never-checked." For that one filter value we instead fetch the
  // largest page the API allows with no status filter and narrow to
  // neverChecked rows client-side, trading true pagination for a single
  // capped request — acceptable at this app's scale (see README "Module 6"
  // freshness/scale notes), but it means a "Never Checked" filter beyond
  // MAX_PAGE_SIZE non-Closed orders won't show everything (flagged below).
  const isNeverCheckedFilter = ctbFilter === "NeverChecked";
  const apiCtbStatus: CtbStatusLabel | undefined =
    ctbFilter === "Clear To Build" || ctbFilter === "RM Shortage" ? ctbFilter : undefined;

  const listQuery = useCtbDashboard({
    page: isNeverCheckedFilter ? 1 : page,
    pageSize: isNeverCheckedFilter ? MAX_PAGE_SIZE : DEFAULT_PAGE_SIZE,
    ctbStatus: apiCtbStatus,
  });

  const counts = useCtbCounts();
  const recheckAll = useRecheckAllCtb();
  const [recheckDialogOpen, setRecheckDialogOpen] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<RecheckAllSummary | null>(null);

  async function handleRecheckAll() {
    try {
      const result = await recheckAll.mutateAsync();
      setLastResult(result);
      setRecheckDialogOpen(false);
    } catch {
      // Surfaced inline in the dialog via recheckAll.isError — kept open so
      // the user sees why it failed instead of the dialog vanishing on them.
    }
  }

  const { data, isPending, isError, error, isPlaceholderData } = listQuery;
  const rows = isNeverCheckedFilter ? (data?.items ?? []).filter((r) => r.neverChecked) : (data?.items ?? []);
  const neverCheckedCapped = isNeverCheckedFilter && !!data && data.total > MAX_PAGE_SIZE;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Clear to Build</h1>
          <p className="text-sm text-ink-muted">Which open orders are blocked on material, right now</p>
        </div>

        <AlertDialog open={recheckDialogOpen} onOpenChange={setRecheckDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button>
              <RefreshCw />
              Recheck All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Recheck every open order?</AlertDialogTitle>
              <AlertDialogDescription>
                Re-evaluates clear-to-build status against current stock for every non-Closed order — this can touch
                a large number of orders and may take a moment.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {recheckAll.isError && (
              <p className="text-xs text-status-critical">{apiErrorMessage(recheckAll.error)}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={recheckAll.isPending}>Cancel</AlertDialogCancel>
              <Button onClick={handleRecheckAll} disabled={recheckAll.isPending}>
                <RefreshCw className={recheckAll.isPending ? "animate-spin" : ""} />
                {recheckAll.isPending ? "Rechecking…" : "Recheck All"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {lastResult && (
        <Alert variant="success" className="mb-4">
          <ShieldCheck />
          <AlertTitle>Recheck complete</AlertTitle>
          <AlertDescription>
            <div className="flex items-center justify-between gap-4">
              <span>
                {formatNumber(lastResult.totalEvaluated)} order{lastResult.totalEvaluated === 1 ? "" : "s"} evaluated
                — {formatNumber(lastResult.clearToBuildCount)} clear to build,{" "}
                {formatNumber(lastResult.rmShortageCount)} short on material.
              </span>
              <button
                type="button"
                onClick={() => setLastResult(null)}
                aria-label="Dismiss"
                className="shrink-0 text-status-success/80 hover:text-status-success"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-3 gap-3">
        {counts.isError ? (
          <div className="col-span-3">
            <Alert variant="critical">
              <TriangleAlert />
              <AlertDescription>Couldn&apos;t load the summary counts.</AlertDescription>
            </Alert>
          </div>
        ) : counts.isPending ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[64px]" />)
        ) : (
          <>
            <StatTile label="Clear to Build" value={formatNumber(counts.data?.clearCount ?? 0)} variant="success" />
            <StatTile label="RM Shortage" value={formatNumber(counts.data?.shortageCount ?? 0)} variant="critical" />
            <StatTile
              label="Never Checked"
              value={formatNumber(counts.data?.neverCheckedCount ?? 0)}
              variant="faint"
            />
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={ctbFilter}
          onValueChange={(v) => updateParams({ ctbStatus: v === "all" ? null : v, page: null })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="CTB status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All CTB statuses</SelectItem>
            <SelectItem value="Clear To Build">Clear to Build</SelectItem>
            <SelectItem value="RM Shortage">RM Shortage</SelectItem>
            <SelectItem value="NeverChecked">Never Checked</SelectItem>
          </SelectContent>
        </Select>

        {ctbFilter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => updateParams({ ctbStatus: null, page: null })}>
            Clear filter
          </Button>
        )}
      </div>

      {neverCheckedCapped && data && (
        <Alert variant="info" className="mb-4">
          <TriangleAlert />
          <AlertDescription>
            Showing the first {MAX_PAGE_SIZE} non-Closed orders — there are {formatNumber(data.total)} total, so some
            never-checked orders may not be listed here.
          </AlertDescription>
        </Alert>
      )}

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load the CTB dashboard</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {rows.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={ShieldQuestion}
                title={ctbFilter !== "all" ? "No orders match this filter" : "No open orders"}
                description={
                  ctbFilter !== "all"
                    ? "Try a different CTB status."
                    : "Every order is Closed, or there are no orders yet."
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>CTB Status</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      Last Checked
                      <Clock className="size-3 text-ink-faint" />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Shortage Parts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <CtbDashboardTableRow key={row.orderId} row={row} onClick={() => navigate(`/orders/${row.orderId}`)} />
                ))}
              </TableBody>
            </Table>
          )}

          {!isNeverCheckedFilter && rows.length > 0 && (
            <PaginationControls
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={(p) => updateParams({ page: String(p) })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CtbDashboardTableRow({ row, onClick }: { row: CtbDashboardRow; onClick: () => void }) {
  const isStale = !!row.ctbCheckedAt && Date.now() - new Date(row.ctbCheckedAt).getTime() > CTB_FRESHNESS_WINDOW_MS;

  return (
    <TableRow className="cursor-pointer" onClick={onClick}>
      <TableCell className="font-mono text-signal-amber">{row.orderId}</TableCell>
      <TableCell>{row.client}</TableCell>
      <TableCell>
        <PriorityBadge priority={row.priority} />
      </TableCell>
      <TableCell>
        <CtbStatusBadge row={row} />
      </TableCell>
      <TableCell>
        {row.ctbCheckedAt ? (
          <span
            className={isStale ? "inline-flex items-center gap-1.5 text-signal-amber" : "text-ink-muted"}
            title={formatDateTime(row.ctbCheckedAt)}
          >
            {isStale && <TriangleAlert className="size-3.5" />}
            {formatRelativeTime(row.ctbCheckedAt)}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </TableCell>
      <TableCell numeric className={row.shortages.length > 0 ? "text-status-critical" : "text-ink-faint"}>
        {row.ctbStatus === "RM Shortage" ? row.shortages.length : "—"}
      </TableCell>
    </TableRow>
  );
}

function CtbStatusBadge({ row }: { row: CtbDashboardRow }) {
  if (row.ctbStatus === "RM Shortage") {
    return (
      <Badge variant="critical">
        <ShieldAlert className="size-3" />
        RM Shortage
      </Badge>
    );
  }
  if (row.ctbStatus === "Clear To Build") {
    return (
      <Badge variant="success">
        <ShieldCheck className="size-3" />
        Clear to Build
      </Badge>
    );
  }
  return (
    <Badge variant="neutral">
      <ShieldQuestion className="size-3" />
      Never Checked
    </Badge>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
