import { useNavigate, useSearchParams } from "react-router";
import { TriangleAlert } from "lucide-react";
import { useAtRiskOrders, useRiskSummary } from "./use-risk";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
import { PriorityBadge } from "@/features/orders/order-badges";
import { ScheduleStatusBadge } from "@/components/schedule-status-badge";
import { SlackDays } from "@/components/slack-days";
import { StatTile } from "@/features/dashboard/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDecimal, formatNumber } from "@/lib/format";

const PRIORITIES = ["Low", "Medium", "High"] as const;

// This page is deliberately a filtered ENTRY POINT, not a second
// recommendations view — Phase 2's Order detail page already has a full
// RiskPanel (recommendations, recovery options, disclaimer) that mounts
// whenever an order's schedule is At Risk. Clicking a row here just
// navigates there; nothing about recommendations is rebuilt in this file.
export function RiskPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const priority = (searchParams.get("priority") as (typeof PRIORITIES)[number] | null) ?? undefined;
  const lineId = searchParams.get("lineId") ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const { data: lines } = useLinesForFilter();
  const summary = useRiskSummary();
  const { data, isPending, isError, error, isPlaceholderData } = useAtRiskOrders({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    priority,
    lineId,
  });

  const hasActiveFilters = !!(priority || lineId);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-primary">Risk</h1>
        <p className="text-sm text-ink-muted">Orders falling behind schedule, worst first — click one to see recovery options</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {summary.isError ? (
          <div className="col-span-5">
            <Alert variant="critical">
              <TriangleAlert />
              <AlertDescription>{apiErrorMessage(summary.error, "Couldn't load the risk summary.")}</AlertDescription>
            </Alert>
          </div>
        ) : summary.isPending ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[64px]" />)
        ) : (
          summary.data && (
            <>
              <StatTile label="At Risk" value={formatNumber(summary.data.totalAtRisk)} variant="critical" />
              <StatTile label="On Track" value={formatNumber(summary.data.totalOnTrack)} variant="success" />
              <StatTile label="High Priority" value={formatNumber(summary.data.atRiskByPriority.High)} variant="critical" sublabel="at risk" />
              <StatTile label="Medium Priority" value={formatNumber(summary.data.atRiskByPriority.Medium)} variant="info" sublabel="at risk" />
              <StatTile label="Low Priority" value={formatNumber(summary.data.atRiskByPriority.Low)} variant="faint" sublabel="at risk" />
            </>
          )
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={priority ?? "all"} onValueChange={(v) => updateParams({ priority: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={lineId ?? "all"} onValueChange={(v) => updateParams({ lineId: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Line" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lines</SelectItem>
            {(lines ?? []).map((l) => (
              <SelectItem key={l.lineId} value={l.lineId}>
                {l.lineName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load at-risk orders</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={TriangleAlert}
                title={hasActiveFilters ? "No at-risk orders match these filters" : "Nothing is at risk"}
                description={hasActiveFilters ? "Try clearing a filter." : "Every scheduled order is currently on track."}
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </Button>
                  ) : undefined
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
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Daily Output</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Est. End</TableHead>
                  <TableHead>Slack</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.orderId} className="cursor-pointer" onClick={() => navigate(`/orders/${row.orderId}`)}>
                    <TableCell className="font-mono text-signal-amber">{row.orderId}</TableCell>
                    <TableCell>{row.client}</TableCell>
                    <TableCell>
                      <PriorityBadge priority={row.priority} />
                    </TableCell>
                    <TableCell className="font-mono">{row.lineName ?? row.lineId ?? "—"}</TableCell>
                    <TableCell numeric>{row.dailyOutput != null ? formatDecimal(row.dailyOutput, 0) : "—"}</TableCell>
                    <TableCell className="font-mono text-ink-muted">{row.startDate ? formatDate(row.startDate) : "—"}</TableCell>
                    <TableCell className="font-mono text-ink-muted">{row.estEndDate ? formatDate(row.estEndDate) : "—"}</TableCell>
                    <TableCell>
                      <SlackDays days={row.slackDays} />
                    </TableCell>
                    <TableCell>
                      <ScheduleStatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data.items.length > 0 && (
            <PaginationControls page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => updateParams({ page: String(p) })} />
          )}
        </div>
      )}
    </div>
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
