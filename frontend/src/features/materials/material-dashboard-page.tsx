import * as React from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { Boxes, ChevronDown, ChevronRight, PackageX, TriangleAlert } from "lucide-react";
import { useMaterialShortages, useMaterialsSummary } from "./use-materials";
import { useCriticalParts } from "@/features/rm-inventory/use-rm-inventory";
import { StatTile } from "@/features/dashboard/stat-tile";
import { PriorityBadge } from "@/features/orders/order-badges";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import type { MaterialsSummary, OrderPriority, PartShortageSummary } from "@/types/api";

export function MaterialDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const priority = (searchParams.get("priority") as OrderPriority | null) ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const summary = useMaterialsSummary();
  const shortages = useMaterialShortages({ page, pageSize: DEFAULT_PAGE_SIZE, priority });
  const critical = useCriticalParts();

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-primary">Material Dashboard</h1>
        <p className="text-sm text-ink-muted">Which parts are blocking orders, and which are running low</p>
      </div>

      <div className="mb-5">
        <SummaryStrip summary={summary} />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Material Shortages</CardTitle>
          <CardDescription>
            One row per short part — expand it to see exactly which orders it&apos;s blocking, since restocking that
            part is what would clear them for build.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select
              value={priority ?? "all"}
              onValueChange={(v) => updateParams({ priority: v === "all" ? null : v, page: null })}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="Medium">Medium &amp; above</SelectItem>
                <SelectItem value="High">High only</SelectItem>
              </SelectContent>
            </Select>
            {priority && (
              <Button variant="ghost" size="sm" onClick={() => updateParams({ priority: null, page: null })}>
                Clear filter
              </Button>
            )}
          </div>

          <ShortagesTable
            shortages={shortages}
            hasActiveFilters={!!priority}
            onPageChange={(p) => updateParams({ page: String(p) })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Critical Stock</CardTitle>
          <CardDescription>Parts at or below their critical threshold, worst deficit first</CardDescription>
        </CardHeader>
        <CardContent>
          <CriticalStockTable critical={critical} navigate={navigate} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStrip({ summary }: { summary: ReturnType<typeof useMaterialsSummary> }) {
  if (summary.isError) {
    return (
      <Alert variant="critical">
        <TriangleAlert />
        <AlertDescription>{apiErrorMessage(summary.error, "Couldn't load the summary counts.")}</AlertDescription>
      </Alert>
    );
  }

  if (summary.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[64px]" />
        ))}
      </div>
    );
  }

  if (!summary.data) return null;
  const data: MaterialsSummary = summary.data;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile label="Parts Short" value={formatNumber(data.totalShortagePartsCount)} variant="critical" />
      <StatTile label="Critical Parts" value={formatNumber(data.totalCriticalPartsCount)} variant="critical" />
      <StatTile
        label="High Priority Orders"
        value={formatNumber(data.affectedOrdersByPriority.High)}
        variant="critical"
        sublabel="waiting on a short part"
      />
      <StatTile
        label="Medium Priority Orders"
        value={formatNumber(data.affectedOrdersByPriority.Medium)}
        variant="info"
        sublabel="waiting on a short part"
      />
      <StatTile
        label="Low Priority Orders"
        value={formatNumber(data.affectedOrdersByPriority.Low)}
        variant="faint"
        sublabel="waiting on a short part"
      />
    </div>
  );
}

function ShortagesTable({
  shortages,
  hasActiveFilters,
  onPageChange,
}: {
  shortages: ReturnType<typeof useMaterialShortages>;
  hasActiveFilters: boolean;
  onPageChange: (page: number) => void;
}) {
  const { data, isPending, isError, error, isPlaceholderData } = shortages;
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (isError) {
    return (
      <Alert variant="critical">
        <TriangleAlert />
        <AlertTitle>Couldn&apos;t load material shortages</AlertTitle>
        <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (isPending) return <RowsSkeleton />;
  if (!data) return null;

  return (
    <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {data.items.length === 0 ? (
        <div className="rounded-md border border-surface-border bg-surface-sunken">
          <EmptyState
            icon={PackageX}
            title={hasActiveFilters ? "No shortages match this filter" : "No material shortages"}
            description={
              hasActiveFilters
                ? "Try a lower priority threshold."
                : "Every open order is clear to build against current stock."
            }
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Part</TableHead>
              <TableHead className="text-right">Total Short Qty</TableHead>
              <TableHead className="text-right">Affected Orders</TableHead>
              <TableHead>Highest Priority</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => {
              const key = row.partId ?? `name:${row.partName}`;
              return <ShortagePartRows key={key} row={row} expanded={expanded.has(key)} onToggle={() => toggle(key)} />;
            })}
          </TableBody>
        </Table>
      )}

      {data.items.length > 0 && (
        <PaginationControls page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={onPageChange} />
      )}
    </div>
  );
}

function ShortagePartRows({
  row,
  expanded,
  onToggle,
}: {
  row: PartShortageSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {expanded ? (
            <ChevronDown className="size-4 text-ink-muted" />
          ) : (
            <ChevronRight className="size-4 text-ink-muted" />
          )}
        </TableCell>
        <TableCell>
          <span className="font-mono">{row.partId ?? row.partName}</span>
          {row.partId && <span className="ml-1.5 text-xs text-ink-muted">{row.partName}</span>}
        </TableCell>
        <TableCell numeric className="text-status-critical">
          {formatNumber(row.totalShortQty)}
        </TableCell>
        <TableCell numeric>{formatNumber(row.affectedOrderCount)}</TableCell>
        <TableCell>
          <PriorityBadge priority={row.highestPriority} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-surface-sunken/50 p-0">
            <div className="px-4 py-3">
              <p className="mb-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
                Orders waiting on this part
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Short Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.affectedOrders.map((o) => (
                    <TableRow key={o.orderId}>
                      <TableCell>
                        <Link to={`/orders/${o.orderId}`} className="font-mono text-signal-amber hover:underline">
                          {o.orderId}
                        </Link>
                      </TableCell>
                      <TableCell>{o.client}</TableCell>
                      <TableCell>
                        <PriorityBadge priority={o.priority} />
                      </TableCell>
                      <TableCell className="font-mono text-ink-muted">
                        {o.dueDate ? formatDate(o.dueDate) : "—"}
                      </TableCell>
                      <TableCell numeric className="text-status-critical">
                        {formatNumber(o.shortQty)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function CriticalStockTable({
  critical,
  navigate,
}: {
  critical: ReturnType<typeof useCriticalParts>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { data, isPending, isError, error } = critical;

  if (isError) {
    return (
      <Alert variant="critical">
        <TriangleAlert />
        <AlertTitle>Couldn&apos;t load critical parts</AlertTitle>
        <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (isPending) return <RowsSkeleton />;
  if (!data) return null;

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-surface-border bg-surface-sunken">
        <EmptyState
          icon={Boxes}
          title="No parts are currently critical"
          description="Every part with a threshold set is currently above it."
        />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Part ID</TableHead>
          <TableHead className="text-right">Stock</TableHead>
          <TableHead className="text-right">Threshold</TableHead>
          <TableHead className="text-right">Deficit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((part) => (
          <TableRow
            key={part.partId}
            className="cursor-pointer"
            onClick={() => navigate(`/rm-inventory/${encodeURIComponent(part.partId)}`)}
          >
            <TableCell className="font-mono text-signal-amber">{part.partId}</TableCell>
            <TableCell numeric>{formatNumber(part.stock)}</TableCell>
            <TableCell numeric className="text-ink-muted">
              {formatNumber(part.criticalThreshold)}
            </TableCell>
            <TableCell numeric className="text-status-critical">
              {formatNumber(part.deficit)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
