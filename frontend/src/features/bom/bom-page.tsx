import { Link, useSearchParams } from "react-router";
import { ListTree, Plus, Upload, Calculator, TriangleAlert } from "lucide-react";
import { useBomBySku } from "./use-bom";
import { ComponentFormDialog } from "./component-form-dialog";
import { DeleteComponentDialog } from "./delete-component-dialog";
import { BulkImportDialog } from "./bulk-import-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { useMaterialDetail } from "@/features/rm-inventory/use-rm-inventory";
import { SkuCombobox } from "@/features/orders/sku-combobox";
import { useProductsForPicker } from "@/features/orders/use-products";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDecimal, formatNumber } from "@/lib/format";
import type { Product } from "@/types/api";

const CAN_WRITE_ROLES = new Set(["Admin", "StoreManager"]);

export function BomPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const sku = searchParams.get("sku") ?? null;
  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);

  const { data: products } = useProductsForPicker("");
  const selectedProduct = products?.find((p) => p.sku === sku) ?? null;

  function handleSelectSku(product: Product) {
    setSearchParams({ sku: product.sku });
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-primary">Bill of Materials</h1>
        <p className="text-sm text-ink-muted">BOM data is organized per SKU — select one to view its components.</p>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        {/* w-full below sm: a flat w-80 (320px) left only ~7px of slack at
            a 375px viewport (375 - px-6 page padding) — technically fit,
            but fragile on anything narrower (e.g. a 360px Android phone). */}
        <div className="w-full sm:w-80">
          <label className="mb-1.5 block text-xs font-medium tracking-wide text-ink-muted uppercase">SKU</label>
          <SkuCombobox value={sku} onSelect={handleSelectSku} />
        </div>
        {sku && (
          <Button variant="outline" asChild>
            <Link to={`/bom/explosion?sku=${encodeURIComponent(sku)}`}>
              <Calculator />
              What-if Explosion
            </Link>
          </Button>
        )}
      </div>

      {!sku ? (
        <div className="rounded-md border border-surface-border bg-surface-raised">
          <EmptyState icon={ListTree} title="Select a SKU" description="Choose a SKU above to view or edit its bill of materials." />
        </div>
      ) : (
        <BomComponentsPanel modelRef={sku} productName={selectedProduct?.modelName} canWrite={canWrite} />
      )}
    </div>
  );
}

function BomComponentsPanel({
  modelRef,
  productName,
  canWrite,
}: {
  modelRef: string;
  productName?: string;
  canWrite: boolean;
}) {
  const { data, isPending, isError, error } = useBomBySku(modelRef);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-medium tracking-wide text-ink-primary uppercase">
            Components — {modelRef}
          </h2>
          {productName && <p className="text-sm text-ink-muted">{productName}</p>}
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <BulkImportDialog
              modelRef={modelRef}
              trigger={
                <Button variant="outline">
                  <Upload />
                  Bulk Import
                </Button>
              }
            />
            <ComponentFormDialog
              modelRef={modelRef}
              trigger={
                <Button>
                  <Plus />
                  Add Component
                </Button>
              }
            />
          </div>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this SKU&apos;s BOM</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-md border border-surface-border bg-surface-raised">
          <EmptyState
            icon={ListTree}
            title="No components yet"
            description={
              canWrite ? "Add the first component, or bulk import several at once." : "This SKU has no BOM defined yet."
            }
            action={
              canWrite ? (
                <ComponentFormDialog
                  modelRef={modelRef}
                  trigger={
                    <Button size="sm">
                      <Plus />
                      Add Component
                    </Button>
                  }
                />
              ) : undefined
            }
          />
        </div>
      )}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part Name</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead className="text-right">Qty per Unit</TableHead>
              <TableHead className="text-right">RM Stock</TableHead>
              {canWrite && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((component) => (
              <TableRow key={component.id}>
                <TableCell>{component.partName}</TableCell>
                <TableCell className="text-ink-muted">{component.uom}</TableCell>
                <TableCell numeric>{formatDecimal(component.qtyPerUnit, 3)}</TableCell>
                <TableCell numeric>
                  <RmStockCell partId={component.partId} />
                </TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <ComponentFormDialog
                        modelRef={modelRef}
                        component={component}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteComponentDialog modelRef={modelRef} id={component.id} partName={component.partName} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// A BOM row with no linked RM Inventory part (partId null) is a real,
// documented data-model state — shown plainly, not hidden or treated as an
// error. A partId that IS set but no longer resolves (e.g. the RM row was
// since deleted) degrades the same way rather than crashing the table.
function RmStockCell({ partId }: { partId: string | null }) {
  const { data, isPending, isError } = useMaterialDetail(partId ?? undefined);

  if (!partId) {
    return <span className="text-xs text-ink-faint">Not linked to RM Inventory</span>;
  }
  if (isPending) return <Skeleton className="ml-auto h-4 w-12" />;
  if (isError || !data) {
    return <span className="text-xs text-ink-faint">Not found in RM Inventory</span>;
  }
  return (
    <Link to={`/rm-inventory/${encodeURIComponent(partId)}`} className="font-mono text-signal-amber hover:underline">
      {formatNumber(data.stock)}
    </Link>
  );
}
