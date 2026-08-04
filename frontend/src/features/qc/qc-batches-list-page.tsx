import * as React from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { ScanBarcode, Plus, TriangleAlert } from "lucide-react";
import { useQcBatchesList, useGenerateQcBatches } from "./use-qc-batches";
import { GenerateResultPanel } from "./generate-result-panel";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { GenerateQcBatchesResult } from "@/types/api";

const CAN_ACT_ROLES = new Set(["Admin", "ProductionManager"]);

export function QcBatchesListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const orderId = searchParams.get("orderId") ?? "";
  const sku = searchParams.get("sku") ?? "";
  const batchNumber = searchParams.get("batchNumber") ?? "";

  const [orderIdInput, setOrderIdInput] = React.useState(orderId);
  const [skuInput, setSkuInput] = React.useState(sku);
  const [batchNumberInput, setBatchNumberInput] = React.useState(batchNumber);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  // Debounced free-text filters, same pattern as every other list page's
  // search input (see orders-list-page.tsx).
  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (orderIdInput !== orderId) updateParams({ orderId: orderIdInput || null, page: null });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdInput]);
  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (skuInput !== sku) updateParams({ sku: skuInput || null, page: null });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuInput]);
  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (batchNumberInput !== batchNumber) updateParams({ batchNumber: batchNumberInput || null, page: null });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchNumberInput]);

  const canAct = !!user && CAN_ACT_ROLES.has(user.role);
  const filters = { page, pageSize: DEFAULT_PAGE_SIZE, orderId: orderId || undefined, sku: sku || undefined, batchNumber: batchNumber || undefined };
  const { data, isPending, isError, error, isPlaceholderData } = useQcBatchesList(filters);

  const generateBatches = useGenerateQcBatches();
  const [result, setResult] = React.useState<GenerateQcBatchesResult | null>(null);

  async function handleGenerate() {
    setResult(null);
    try {
      const r = await generateBatches.mutateAsync();
      setResult(r);
    } catch {
      // Surfaced below via generateBatches.isError.
    }
  }

  const hasActiveFilters = !!(orderId || sku || batchNumber);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">QC Batches</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canAct && (
          <Button onClick={handleGenerate} disabled={generateBatches.isPending}>
            {generateBatches.isPending ? "Generating…" : "Generate Batches"}
          </Button>
        )}
      </div>

      {result && <GenerateResultPanel result={result} onDismiss={() => setResult(null)} />}

      {generateBatches.isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t generate batches</AlertTitle>
          <AlertDescription>{apiErrorMessage(generateBatches.error)}</AlertDescription>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Order ID…" value={orderIdInput} onChange={(e) => setOrderIdInput(e.target.value)} className="w-40" />
        <Input placeholder="SKU…" value={skuInput} onChange={(e) => setSkuInput(e.target.value)} className="w-40" />
        <Input
          placeholder="Batch number…"
          value={batchNumberInput}
          onChange={(e) => setBatchNumberInput(e.target.value)}
          className="w-48"
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOrderIdInput("");
              setSkuInput("");
              setBatchNumberInput("");
              setSearchParams({});
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load QC batches</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={ScanBarcode}
                title={hasActiveFilters ? "No QC batches match these filters" : "No QC batches yet"}
                description={
                  hasActiveFilters
                    ? "Try a different search."
                    : "Generate Batches creates a batch for every Scheduled order that doesn't have one yet."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </Button>
                  ) : canAct ? (
                    <Button size="sm" onClick={handleGenerate} disabled={generateBatches.isPending}>
                      <Plus />
                      {generateBatches.isPending ? "Generating…" : "Generate Batches"}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch Number</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Serial Range</TableHead>
                  <TableHead>Testing Plan</TableHead>
                  <TableHead>Generated At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((batch) => (
                  <TableRow key={batch.id} className="cursor-pointer" onClick={() => navigate(`/qc-batches/${encodeURIComponent(batch.batchNumber)}`)}>
                    <TableCell className="font-mono text-signal-amber">{batch.batchNumber}</TableCell>
                    <TableCell>
                      <Link
                        to={`/orders/${batch.orderId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-signal-amber hover:underline"
                      >
                        {batch.orderId}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">{batch.sku}</TableCell>
                    <TableCell className="font-mono text-ink-muted">
                      {batch.serialRangeStart}–{batch.serialRangeEnd}
                    </TableCell>
                    <TableCell className={batch.testingPlanName ? "" : "text-ink-faint"}>
                      {batch.testingPlanName ?? "Not configured"}
                    </TableCell>
                    <TableCell className="text-ink-muted">{formatDateTime(batch.generatedAt)}</TableCell>
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
