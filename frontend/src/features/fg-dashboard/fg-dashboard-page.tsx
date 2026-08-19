import { useSearchParams } from "react-router";
import { TriangleAlert } from "lucide-react";
import { useFgDashboardSummary } from "./use-fg-dashboard";
import { StatTile } from "@/features/dashboard/stat-tile";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";

// FG Module Part 5 (final part) — see ppc-backend README "FG Module Part
// 5" for the field-by-field source table this page mirrors.
//
// A deliberate deviation from this part's own literal instruction: the
// headline figures (Total FG Stock, Dispatch Ready, Reserved Stock) use
// StatTile in its "lead" size, NOT GaugeDial. GaugeDial (components/
// gauge-dial.tsx) is purpose-built for a 0-100 PERCENTAGE against red/
// amber/green thresholds (see its own doc comment and kpi-thresholds.ts) —
// every one of this dashboard's headline figures is a raw QUANTITY/COUNT
// with no natural 0-100 denominator (there's no "total capacity" this
// backend exposes to normalize stock-on-hand against). Forcing a
// percentage-gauge visual onto an unbounded count would either pin the
// needle at 100 for any real factory volume or require inventing a
// denominator the backend doesn't provide — neither is honest. StatTile's
// own "lead" size (already used for Module 14's own count-based headline
// metrics — Scheduled/Delayed/At Risk, Parts Short — see dashboard-page.tsx)
// is the correct existing pattern for "a big, important COUNT," so it's
// reused here instead.
export function FgDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const { data, isPending, isError, error, isFetching } = useFgDashboardSummary({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">FG Dashboard</h1>
          <p className="text-sm text-ink-muted">
            Finished Goods stock, QC, reservation, and dispatch summary — current-state, except where a date range narrows it.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => updateParams({ dateFrom: e.target.value || null })} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">To</label>
            <Input type="date" value={dateTo} onChange={(e) => updateParams({ dateTo: e.target.value || null })} className="w-40" />
          </div>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
              Clear (today)
            </Button>
          )}
        </div>
      </div>

      {isError && (
        <Alert variant="critical" className="mb-6">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load the FG dashboard</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <DashboardSkeleton />}

      {data && (
        <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile label="Total FG Stock" value={formatNumber(data.totalFgStock)} variant="success" size="lead" sublabel="Available, non-fully-dispatched batches" />
            <StatTile label="Dispatch Ready" value={formatNumber(data.dispatchReady)} variant="info" size="lead" sublabel="Batches Ready or Partial" />
            <StatTile label="Reserved Stock" value={formatNumber(data.reservedStock)} variant="amber" size="lead" sublabel="Set aside against Sales Orders" />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="QC Pending" value={formatNumber(data.qcPending)} variant="faint" />
            <StatTile label="QC Passed" value={formatNumber(data.qcPassed)} variant="success" />
            <StatTile label="QC Hold" value={formatNumber(data.qcHold)} variant="critical" />
            <StatTile label="Rejected" value={formatNumber(data.rejected)} variant="critical" />
            <StatTile label="Rework" value={formatNumber(data.rework)} variant="critical" />
            <StatTile label="Today's Production" value={formatNumber(data.todaysFgProduction)} variant="info" sublabel={dateFrom || dateTo ? "Selected range" : "Today"} />
            <StatTile label="Dispatched Qty" value={formatNumber(data.dispatchedQuantity)} variant="success" sublabel={dateFrom || dateTo ? "Selected range" : "Today"} />
          </div>

          {/* Single column, not a 2-up grid: each table has 4-5 columns of
              its own (warehouse/SKU + grade + three quantities) — a 2-up
              split leaves each card too narrow to show all of them without
              relying on Table's own internal horizontal scroll (which
              works, but shouldn't be the default experience for a handful
              of columns that fit comfortably at full width). */}
          <div className="grid grid-cols-1 gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Warehouse-Wise Stock</CardTitle>
                <CardDescription>Available / Reserved / Dispatched per warehouse</CardDescription>
              </CardHeader>
              <CardContent>
                {data.warehouseWiseStock.length === 0 ? (
                  <p className="text-sm text-ink-faint">No FG batches yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Warehouse</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Reserved</TableHead>
                          <TableHead className="text-right">Dispatched</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.warehouseWiseStock.map((w) => (
                          <TableRow key={w.warehouseId ?? "unassigned"}>
                            <TableCell className="font-mono">{w.warehouseId ?? <span className="text-ink-faint italic">Unassigned</span>}</TableCell>
                            <TableCell numeric className="text-signal-amber">{formatNumber(w.availableQty)}</TableCell>
                            <TableCell numeric className="text-ink-muted">{formatNumber(w.reservedQty)}</TableCell>
                            <TableCell numeric className="text-ink-muted">{formatNumber(w.dispatchedQty)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Product / Grade-Wise Stock</CardTitle>
                <CardDescription>Available / Reserved / Dispatched per SKU + plywood grade</CardDescription>
              </CardHeader>
              <CardContent>
                {data.productGradeWiseStock.length === 0 ? (
                  <p className="text-sm text-ink-faint">No FG batches yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Reserved</TableHead>
                          <TableHead className="text-right">Dispatched</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.productGradeWiseStock.map((g) => (
                          <TableRow key={`${g.sku}-${g.plywoodGrade ?? "none"}`}>
                            <TableCell className="font-mono">{g.sku}</TableCell>
                            <TableCell className="text-ink-muted">{g.plywoodGrade ?? "—"}</TableCell>
                            <TableCell numeric className="text-signal-amber">{formatNumber(g.availableQty)}</TableCell>
                            <TableCell numeric className="text-ink-muted">{formatNumber(g.reservedQty)}</TableCell>
                            <TableCell numeric className="text-ink-muted">{formatNumber(g.dispatchedQty)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
