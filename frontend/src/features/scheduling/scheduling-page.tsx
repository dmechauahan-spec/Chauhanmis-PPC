import { useNavigate, useSearchParams } from "react-router";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { useScheduleList } from "./use-scheduling";
import { useLinesForFilter } from "./use-lines";
import { RunSchedulingDialog } from "./run-scheduling-dialog";
import { UnscheduleDialog } from "./unschedule-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { ScheduleStatusBadge } from "@/components/schedule-status-badge";
import { SlackDays } from "@/components/slack-days";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDecimal } from "@/lib/format";

const CAN_WRITE_ROLES = new Set(["Admin", "ProductionManager"]);

export function SchedulingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: lines } = useLinesForFilter();

  const page = Number(searchParams.get("page") ?? "1");
  const lineId = searchParams.get("lineId") ?? undefined;
  const status = (searchParams.get("status") as "OnTrack" | "AtRisk" | null) ?? undefined;
  const startDateFrom = searchParams.get("startDateFrom") ?? undefined;
  const startDateTo = searchParams.get("startDateTo") ?? undefined;

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const hasActiveFilters = !!(lineId || status || startDateFrom || startDateTo);
  const { data, isPending, isError, error } = useScheduleList({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    lineId,
    status,
    startDateFrom,
    startDateTo,
  });

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      {/* flex-wrap + gap-3: without it, the title and "Run Scheduling"
          button shared one unwrapped row that fit at exactly 375px with
          only a couple pixels of breathing room — cramped, and would
          overflow outright on anything narrower. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Scheduling</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} scheduled` : " "}</p>
        </div>
        {canWrite && <RunSchedulingDialog />}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={lineId ?? "all"}
          onValueChange={(v) => updateParams({ lineId: v === "all" ? null : v, page: null })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Line" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lines</SelectItem>
            {lines?.map((line) => (
              <SelectItem key={line.lineId} value={line.lineId}>
                {line.lineName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status ?? "all"}
          onValueChange={(v) => updateParams({ status: v === "all" ? null : v, page: null })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="OnTrack">On Track</SelectItem>
            <SelectItem value="AtRisk">At Risk</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Start date from"
            className="w-40"
            defaultValue={startDateFrom ?? ""}
            onChange={(e) => updateParams({ startDateFrom: e.target.value || null, page: null })}
          />
          <span className="text-xs text-ink-faint">to</span>
          <Input
            type="date"
            aria-label="Start date to"
            className="w-40"
            defaultValue={startDateTo ?? ""}
            onChange={(e) => updateParams({ startDateTo: e.target.value || null, page: null })}
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load the schedule</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {data && (
        <>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={CalendarClock}
                title={hasActiveFilters ? "No scheduled orders match these filters" : "Nothing is scheduled yet"}
                description={
                  hasActiveFilters
                    ? "Try clearing a filter."
                    : canWrite
                      ? "Run the scheduler to assign eligible orders to a line — use the Run Scheduling button above."
                      : "Once orders are scheduled, they'll show up here."
                }
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
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Daily Output</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Est. End</TableHead>
                  <TableHead>Slack</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.orderId}>
                    <TableCell
                      className="cursor-pointer font-mono text-signal-amber"
                      onClick={() => navigate(`/orders/${row.orderId}`)}
                    >
                      {row.orderId}
                    </TableCell>
                    <TableCell>{row.client}</TableCell>
                    <TableCell className="font-mono">{row.lineName ?? row.lineId ?? "—"}</TableCell>
                    <TableCell numeric>{formatDecimal(row.dailyOutput, 0)}</TableCell>
                    <TableCell className="font-mono text-ink-muted">
                      {row.startDate ? formatDate(row.startDate) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-ink-muted">
                      {row.estEndDate ? formatDate(row.estEndDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <SlackDays days={row.slackDays} />
                    </TableCell>
                    <TableCell>
                      <ScheduleStatusBadge status={row.status} />
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <UnscheduleDialog orderId={row.orderId} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data.items.length > 0 && (
            <PaginationControls
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={(p) => updateParams({ page: String(p) })}
            />
          )}
        </>
      )}
    </div>
  );
}
