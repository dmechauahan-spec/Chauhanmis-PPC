import { useSearchParams, Link } from "react-router";
import { PackageCheck, TriangleAlert } from "lucide-react";
import { useFgBatchesList } from "./use-fg-batches";
import { FgStockStatusBadge, FgDispatchStatusBadge } from "./fg-batch-badges";
import { useWarehousesForPicker } from "@/features/warehouses/use-warehouses";
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
import { formatNumber } from "@/lib/format";
import type { FgBatch, FgDispatchStatus, FgQcStatus, FgStockStatus } from "@/types/api";

const QC_STATUSES: FgQcStatus[] = ["Pending", "Pass", "Fail", "Hold"];
const STOCK_STATUSES: FgStockStatus[] = ["Available", "Reserved", "Hold"];
const DISPATCH_STATUSES: FgDispatchStatus[] = ["NotReady", "Ready", "Partial", "Dispatched"];

export function FgBatchesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const productionOrderId = searchParams.get("productionOrderId") ?? "";
  const warehouseId = searchParams.get("warehouseId") ?? undefined;
  const qcStatus = (searchParams.get("qcStatus") as FgQcStatus | null) ?? undefined;
  const stockStatus = (searchParams.get("stockStatus") as FgStockStatus | null) ?? undefined;
  const dispatchStatus = (searchParams.get("dispatchStatus") as FgDispatchStatus | null) ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const { data: warehouses } = useWarehousesForPicker();
  const { data, isPending, isError, error, isPlaceholderData } = useFgBatchesList({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    productionOrderId: productionOrderId || undefined,
    warehouseId,
    qcStatus,
    stockStatus,
    dispatchStatus,
  });

  const hasActiveFilters = !!productionOrderId || !!warehouseId || !!qcStatus || !!stockStatus || !!dispatchStatus;

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">FG Batches</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Production Order ID…"
          value={productionOrderId}
          onChange={(e) => updateParams({ productionOrderId: e.target.value || null, page: null })}
          className="w-48"
        />
        <Select value={warehouseId ?? "all"} onValueChange={(v) => updateParams({ warehouseId: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Warehouse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All warehouses</SelectItem>
            {(warehouses ?? []).map((w) => (
              <SelectItem key={w.warehouseId} value={w.warehouseId}>
                {w.warehouseName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={qcStatus ?? "all"} onValueChange={(v) => updateParams({ qcStatus: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="QC Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All QC statuses</SelectItem>
            {QC_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stockStatus ?? "all"} onValueChange={(v) => updateParams({ stockStatus: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Stock Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock statuses</SelectItem>
            {STOCK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dispatchStatus ?? "all"} onValueChange={(v) => updateParams({ dispatchStatus: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Dispatch Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dispatch statuses</SelectItem>
            {DISPATCH_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
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
          <AlertTitle>Couldn&apos;t load FG batches</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={PackageCheck}
                title={hasActiveFilters ? "No FG batches match this filter" : "No FG batches yet"}
                description={
                  hasActiveFilters
                    ? "Try a different filter."
                    : "FG batches are generated from a QC-passed Daily QC Inspection — see the QC Inspections module."
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>FG Batch No</TableHead>
                    <TableHead>Production Order</TableHead>
                    <TableHead>Product / SKU</TableHead>
                    <TableHead>Grade / Thickness</TableHead>
                    <TableHead className="text-right">Produced</TableHead>
                    <TableHead className="text-right">Passed</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead className="text-right">Rework</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Warehouse / Bin</TableHead>
                    <TableHead>Stock Status</TableHead>
                    <TableHead>Dispatch Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((batch) => (
                    <FgBatchRow key={batch.fgBatchNo} batch={batch} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data.items.length > 0 && (
            <PaginationControls page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => updateParams({ page: String(p) })} />
          )}
        </div>
      )}
    </div>
  );
}

function FgBatchRow({ batch }: { batch: FgBatch }) {
  return (
    <TableRow>
      <TableCell>
        <Link to={`/fg-batches/${batch.fgBatchNo}`} className="font-mono text-signal-amber hover:underline">
          {batch.fgBatchNo}
        </Link>
      </TableCell>
      <TableCell>
        <Link to={`/orders/${batch.productionOrderId}`} className="font-mono text-ink-muted hover:text-ink-primary hover:underline">
          {batch.productionOrderId}
        </Link>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{batch.productName}</span>
          <span className="font-mono text-xs text-ink-muted">{batch.sku}</span>
        </div>
      </TableCell>
      <TableCell>
        {batch.plywoodGrade || batch.thickness != null ? (
          <span className="font-mono text-xs text-ink-muted">
            {batch.plywoodGrade ?? "—"}
            {batch.thickness != null && ` · ${batch.thickness}mm`}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </TableCell>
      <TableCell numeric className="text-ink-muted">{formatNumber(batch.producedQty)}</TableCell>
      <TableCell numeric className="text-ink-muted">{formatNumber(batch.qcPassedQty)}</TableCell>
      <TableCell numeric className={batch.rejectedQty > 0 ? "text-status-critical" : "text-ink-muted"}>
        {formatNumber(batch.rejectedQty)}
      </TableCell>
      <TableCell numeric className="text-ink-muted">{formatNumber(batch.reworkQty)}</TableCell>
      {/* The number a warehouse user actually cares about — visually
          prominent (larger, amber-toned) rather than just another mono
          column like the others. */}
      <TableCell numeric className="text-base font-semibold text-signal-amber">
        {formatNumber(batch.availableQty)}
      </TableCell>
      <TableCell className="text-ink-muted">
        {batch.warehouseId ? (
          <span className="font-mono text-xs">
            {batch.warehouseId}
            {batch.rackBinLocation && ` / ${batch.rackBinLocation}`}
          </span>
        ) : (
          <span className="text-ink-faint">Unassigned</span>
        )}
      </TableCell>
      <TableCell>
        <FgStockStatusBadge status={batch.stockStatus} />
      </TableCell>
      <TableCell>
        <FgDispatchStatusBadge status={batch.dispatchStatus} />
      </TableCell>
    </TableRow>
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

