import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { NotebookPen, Plus, TriangleAlert } from "lucide-react";
import { useDailyLogsList, useDowntimeByReason } from "./use-daily-logs";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
import { useProductsForPicker } from "@/features/orders/use-products";
import { useAuth } from "@/features/auth/auth-context";
import { MiniBarChart } from "@/features/dashboard/mini-bar-chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDecimal, formatNumber } from "@/lib/format";

const CAN_CREATE_ROLES = new Set(["Admin", "ProductionManager"]);
const SHIFTS = ["General", "Full+Extended"] as const;
const DEFAULT_WINDOW_DAYS = 7;

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumDowntimeMinutes(entries: { minutes: string }[]): number {
  return entries.reduce((sum, e) => sum + Number(e.minutes), 0);
}

export function DailyLogsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Default to the last 7 days, pushed into the URL (not just applied
  // silently) so the active window is visible and shareable like every
  // other filter here — an unbounded default would mean "New Entry" opens
  // onto a table that keeps growing forever.
  React.useEffect(() => {
    if (searchParams.get("dateFrom") || searchParams.get("dateTo")) return;
    const today = new Date();
    const from = new Date(today.getTime() - (DEFAULT_WINDOW_DAYS - 1) * 86_400_000);
    const next = new URLSearchParams(searchParams);
    next.set("dateFrom", toDateParam(from));
    next.set("dateTo", toDateParam(today));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const page = Number(searchParams.get("page") ?? "1");
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const lineId = searchParams.get("lineId") ?? undefined;
  const modelId = searchParams.get("modelId") ?? undefined;
  const shift = searchParams.get("shift") ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const canCreate = !!user && CAN_CREATE_ROLES.has(user.role);
  const { data: lines } = useLinesForFilter();
  const { data: products } = useProductsForPicker("");

  const filters = { page, pageSize: DEFAULT_PAGE_SIZE, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, lineId, modelId, shift };
  const { data, isPending, isError, error, isPlaceholderData } = useDailyLogsList(filters);
  const downtimeSummary = useDowntimeByReason({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, lineId });

  const hasNonDateFilters = !!(lineId || modelId || shift);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Daily Logs</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total in range` : " "}</p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/daily-logs/new")}>
            <Plus />
            New Entry
          </Button>
        )}
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Downtime by Reason</CardTitle>
          <CardDescription>Total minutes lost, same date range and line filter as below</CardDescription>
        </CardHeader>
        <CardContent>
          {downtimeSummary.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : downtimeSummary.isError ? (
            <p className="text-sm text-status-critical">Couldn&apos;t load the downtime breakdown.</p>
          ) : (
            <MiniBarChart
              data={(downtimeSummary.data ?? []).map((r) => ({ label: r.reason, value: r.totalMinutes }))}
              formatValue={(v) => `${formatNumber(v)} min`}
              ariaLabel="Downtime minutes by reason"
            />
          )}
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value || null, page: null })}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value || null, page: null })}
            className="w-40"
          />
        </div>

        <Select value={lineId ?? "all"} onValueChange={(v) => updateParams({ lineId: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-40">
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

        <Select value={modelId ?? "all"} onValueChange={(v) => updateParams({ modelId: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All models</SelectItem>
            {(products ?? []).map((p) => (
              <SelectItem key={p.modelId} value={p.modelId}>
                {p.modelName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={shift ?? "all"} onValueChange={(v) => updateParams({ shift: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Shift" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All shifts</SelectItem>
            {SHIFTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasNonDateFilters && (
          <Button variant="ghost" size="sm" onClick={() => updateParams({ lineId: null, modelId: null, shift: null, page: null })}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load daily logs</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={NotebookPen}
                title="No daily logs in this range"
                description={
                  hasNonDateFilters
                    ? "Try widening the date range or clearing a filter."
                    : "Try a different date range, or log the first entry."
                }
                action={
                  canCreate ? (
                    <Button size="sm" onClick={() => navigate("/daily-logs/new")}>
                      <Plus />
                      New Entry
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Present/Total</TableHead>
                  <TableHead className="text-right">Attendance %</TableHead>
                  <TableHead className="text-right">Total Output</TableHead>
                  <TableHead className="text-right">Good Qty</TableHead>
                  <TableHead className="text-right">Downtime (min)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log) => (
                  <TableRow key={log.logId} className="cursor-pointer" onClick={() => navigate(`/daily-logs/${log.logId}`)}>
                    <TableCell className="font-mono text-signal-amber">{formatDate(log.logDate)}</TableCell>
                    <TableCell>{log.shift ?? "—"}</TableCell>
                    <TableCell>{log.lineName ?? "—"}</TableCell>
                    <TableCell className="text-ink-muted">{log.modelName ?? "—"}</TableCell>
                    <TableCell numeric>
                      {log.presentEmployees != null && log.totalEmployees != null
                        ? `${formatNumber(log.presentEmployees)}/${formatNumber(log.totalEmployees)}`
                        : "—"}
                    </TableCell>
                    <TableCell numeric>{log.attendancePct != null ? `${formatDecimal(log.attendancePct, 1)}%` : "—"}</TableCell>
                    <TableCell numeric>{log.totalOutputQty != null ? formatDecimal(log.totalOutputQty, 0) : "—"}</TableCell>
                    <TableCell numeric>{log.goodQty != null ? formatDecimal(log.goodQty, 0) : "—"}</TableCell>
                    <TableCell numeric className={log.downtimeEntries.length > 0 ? "text-status-critical" : "text-ink-faint"}>
                      {log.downtimeEntries.length > 0 ? formatNumber(sumDowntimeMinutes(log.downtimeEntries)) : "—"}
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
