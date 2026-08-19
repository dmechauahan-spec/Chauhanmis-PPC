import * as React from "react";
import { useSearchParams } from "react-router";
import { Package, Plus, TriangleAlert } from "lucide-react";
import { useProductsList } from "./use-products-admin";
import { ProductFormDialog } from "./product-form-dialog";
import { DeleteProductDialog } from "./delete-product-dialog";
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
import { formatDecimal, formatNumber } from "@/lib/format";
import type { Product } from "@/types/api";

const CAN_WRITE_ROLES = new Set(["Admin"]);

export function ProductsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const search = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = React.useState(search);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput || null, page: null });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);
  const { data, isPending, isError, error, isPlaceholderData } = useProductsList({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    search: search || undefined,
  });

  const hasActiveFilters = !!search;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Products</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canWrite && (
          <ProductFormDialog
            trigger={
              <Button>
                <Plus />
                New Product
              </Button>
            }
          />
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search model name or SKU…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="w-64" />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput("");
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
          <AlertTitle>Couldn&apos;t load products</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={Package}
                title={hasActiveFilters ? "No products match this search" : "No products yet"}
                description={
                  hasActiveFilters
                    ? "Try a different search term."
                    : canWrite
                      ? "Add the first Model Master entry to get started."
                      : "Once products are added, they'll show up here."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </Button>
                  ) : canWrite ? (
                    <ProductFormDialog
                      trigger={
                        <Button size="sm">
                          <Plus />
                          New Product
                        </Button>
                      }
                    />
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Model Name</TableHead>
                  <TableHead>Product Type</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Takt Time (s)</TableHead>
                  <TableHead className="text-right">Manpower</TableHead>
                  <TableHead className="text-right">Stations</TableHead>
                  <TableHead className="text-right">Changeover (min)</TableHead>
                  <TableHead>Plywood</TableHead>
                  {canWrite && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((product) => (
                  <TableRow key={product.modelId}>
                    <TableCell className="font-mono text-signal-amber">{product.modelId}</TableCell>
                    <TableCell>{product.modelName}</TableCell>
                    <TableCell className="text-ink-muted">{product.productType}</TableCell>
                    <TableCell className="font-mono">{product.sku}</TableCell>
                    <TableCell numeric>{formatDecimal(product.taktTimeSec, 1)}</TableCell>
                    <TableCell numeric>{formatNumber(product.manpowerRequired)}</TableCell>
                    <TableCell numeric>{formatNumber(product.noOfStations)}</TableCell>
                    <TableCell numeric className="text-ink-muted">
                      {product.changeoverTimeMin != null ? formatDecimal(product.changeoverTimeMin, 1) : "—"}
                    </TableCell>
                    <TableCell>
                      <PlywoodSpecs product={product} />
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <ProductFormDialog
                            product={product}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                          <DeleteProductDialog modelId={product.modelId} />
                        </div>
                      </TableCell>
                    )}
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

// FG Module Part 1 — shown only when at least one plywood attribute is set,
// so non-plywood products (the majority) don't show a column full of dashes
// — a single compact cell rather than three separate ones, matching the FG
// Batches list's own "Grade/Thickness compact combined cell" convention.
function PlywoodSpecs({ product }: { product: Product }) {
  const { plywoodGrade, thickness, sheetLength, sheetWidth } = product;
  if (!plywoodGrade && thickness == null && sheetLength == null && sheetWidth == null) {
    return <span className="text-ink-faint">—</span>;
  }
  const size = sheetLength != null && sheetWidth != null ? `${formatDecimal(sheetLength, 0)}×${formatDecimal(sheetWidth, 0)}` : null;
  return (
    <div className="flex flex-col gap-0.5 font-mono text-xs">
      {plywoodGrade && <span className="text-ink-primary">{plywoodGrade}</span>}
      <span className="text-ink-muted">
        {thickness != null && `${formatDecimal(thickness, 1)}mm`}
        {thickness != null && size && " · "}
        {size && `${size}mm`}
      </span>
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
