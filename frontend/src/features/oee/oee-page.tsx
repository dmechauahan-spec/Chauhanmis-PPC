import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { TrendingUp, TriangleAlert } from "lucide-react";
import { useOeeList, useOeeSummary, useOeeByLine } from "./use-oee";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
import { useProductsForPicker } from "@/features/orders/use-products";
import { KpiTile } from "@/features/dashboard/kpi-tile";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatNumber, formatPct } from "@/lib/format";
import { KPI_THRESHOLDS, kpiVariant } from "@/lib/kpi-thresholds";

const SHIFTS = ["General", "Full+Extended"] as const;
const DEFAULT_WINDOW_DAYS = 7;

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Null pct cells render muted with their explanatory note on hover, never
// a bare "0%" — same "explain what's missing" treatment as Phase 1's
// dashboard KPI tiles.
function PctCell({ value, notes }: { value: number | null; notes?: string[] }) {
  if (value === null) {
    return (
      <span className="text-ink-faint" title={notes?.join(" ") || "Not enough data to compute this."}>
        —
      </span>
    );
  }
  return <>{formatPct(value)}</>;
}

export function OeePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Default to the last 7 days, pushed into the URL so it's visible and
  // shareable — same convention as Daily Logs' list page.
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

  const { data: lines } = useLinesForFilter();
  const { data: products } = useProductsForPicker("");

  const range = { dateFrom, dateTo, lineId, modelId, shift };
  const rangeReady = !!dateFrom && !!dateTo;

  const summary = useOeeSummary(range);
  const byLine = useOeeByLine(range);
  const logs = useOeeList({ page, pageSize: DEFAULT_PAGE_SIZE, ...range });

  const hasNonDateFilters = !!(lineId || modelId || shift);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-primary">OEE</h1>
        <p className="text-sm text-ink-muted">Availability, Performance, Quality, and OEE % over a date range</p>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => updateParams({ dateFrom: e.target.value || null, page: null })} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">To</label>
          <Input type="date" value={dateTo} onChange={(e) => updateParams({ dateTo: e.target.value || null, page: null })} className="w-40" />
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

      {!rangeReady ? (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Select a date range</AlertTitle>
          <AlertDescription>Both From and To are required.</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summary.isError ? (
              <div className="col-span-4">
                <Alert variant="critical">
                  <TriangleAlert />
                  <AlertDescription>{apiErrorMessage(summary.error, "Couldn't load the OEE summary.")}</AlertDescription>
                </Alert>
              </div>
            ) : summary.isPending ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[64px]" />)
            ) : (
              summary.data && (
                <>
                  <KpiTile
                    label="Availability"
                    value={summary.data.availabilityPct}
                    variant={summary.data.availabilityPct === null ? "faint" : "info"}
                    emptyReason="No logs in this range have plannedMinutes set"
                    contributingLabel={`${summary.data.logCount - summary.data.excludedLogsCount.availability} of ${summary.data.logCount} logs`}
                  />
                  <KpiTile
                    label="Performance"
                    value={summary.data.performancePct}
                    variant={summary.data.performancePct === null ? "faint" : "info"}
                    emptyReason="No logs in this range have output + takt time data"
                    contributingLabel={`${summary.data.logCount - summary.data.excludedLogsCount.performance} of ${summary.data.logCount} logs`}
                  />
                  <KpiTile
                    label="Quality"
                    value={summary.data.qualityPct}
                    variant={summary.data.qualityPct === null ? "faint" : "info"}
                    emptyReason="No logs in this range have output + good qty set"
                    contributingLabel={`${summary.data.logCount - summary.data.excludedLogsCount.quality} of ${summary.data.logCount} logs`}
                  />
                  <KpiTile
                    label="OEE"
                    value={summary.data.oeePct}
                    variant={kpiVariant(summary.data.oeePct, KPI_THRESHOLDS.oee)}
                    emptyReason="Not enough data to compute a blended OEE% in this range"
                    contributingLabel={`${formatNumber(summary.data.logCount)} log${summary.data.logCount === 1 ? "" : "s"} in range`}
                  />
                </>
              )
            )}
          </div>

          <Card className="mb-5">
            <CardHeader>
              <CardTitle>By Line</CardTitle>
              <CardDescription>Which lines are underperforming in this range, at a glance</CardDescription>
            </CardHeader>
            <CardContent>
              {byLine.isError ? (
                <Alert variant="critical">
                  <TriangleAlert />
                  <AlertDescription>{apiErrorMessage(byLine.error)}</AlertDescription>
                </Alert>
              ) : byLine.isPending ? (
                <RowsSkeleton />
              ) : !byLine.data || byLine.data.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No logs in this range" description="Try a wider date range or clearing a filter." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead className="text-right">Availability</TableHead>
                      <TableHead className="text-right">Performance</TableHead>
                      <TableHead className="text-right">Quality</TableHead>
                      <TableHead className="text-right">OEE</TableHead>
                      <TableHead className="text-right">Logs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byLine.data.map((row) => (
                      <TableRow key={row.lineId ?? "unassigned"}>
                        <TableCell className={row.lineName ? "" : "text-ink-faint"}>{row.lineName ?? "Unassigned"}</TableCell>
                        <TableCell numeric>
                          <PctCell value={row.availabilityPct} />
                        </TableCell>
                        <TableCell numeric>
                          <PctCell value={row.performancePct} />
                        </TableCell>
                        <TableCell numeric>
                          <PctCell value={row.qualityPct} />
                        </TableCell>
                        <TableCell numeric className="font-medium">
                          <PctCell value={row.oeePct} />
                        </TableCell>
                        <TableCell numeric className="text-ink-muted">
                          {formatNumber(row.logCount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily Logs</CardTitle>
              <CardDescription>Per-entry detail — click a row for the full Daily Log</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.isError ? (
                <Alert variant="critical">
                  <TriangleAlert />
                  <AlertDescription>{apiErrorMessage(logs.error)}</AlertDescription>
                </Alert>
              ) : logs.isPending ? (
                <RowsSkeleton />
              ) : !logs.data || logs.data.items.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No daily logs in this range" description="Try a wider date range or clearing a filter." />
              ) : (
                <div className={logs.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Line</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Availability</TableHead>
                        <TableHead className="text-right">Performance</TableHead>
                        <TableHead className="text-right">Quality</TableHead>
                        <TableHead className="text-right">OEE</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.data.items.map((row) => (
                        <TableRow key={row.logId} className="cursor-pointer" onClick={() => navigate(`/daily-logs/${row.logId}`)}>
                          <TableCell className="font-mono text-signal-amber">{formatDate(row.logDate)}</TableCell>
                          <TableCell>{row.shift ?? "—"}</TableCell>
                          <TableCell className="text-ink-muted">{row.lineName ?? "—"}</TableCell>
                          <TableCell className="text-ink-muted">{row.modelName ?? "—"}</TableCell>
                          <TableCell numeric>
                            <PctCell value={row.availabilityPct} notes={row.notes} />
                          </TableCell>
                          <TableCell numeric>
                            <PctCell value={row.performancePct} notes={row.notes} />
                          </TableCell>
                          <TableCell numeric>
                            <PctCell value={row.qualityPct} notes={row.notes} />
                          </TableCell>
                          <TableCell numeric className="font-medium">
                            <PctCell value={row.oeePct} notes={row.notes} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <PaginationControls
                    page={logs.data.page}
                    pageSize={logs.data.pageSize}
                    total={logs.data.total}
                    onPageChange={(p) => updateParams({ page: String(p) })}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
