import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { Calculator, Info, TriangleAlert } from "lucide-react";
import { useSkuExplosion } from "./use-bom";
import { SkuCombobox } from "@/features/orders/sku-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import type { Product } from "@/types/api";

export function BomExplosionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sku = searchParams.get("sku") ?? null;
  const qtyParam = searchParams.get("qty") ?? "";

  const [qtyInput, setQtyInput] = React.useState(qtyParam);
  const debouncedQty = useDebouncedValue(qtyInput, 350);
  const qty = Number(debouncedQty);
  const hasValidQty = debouncedQty !== "" && Number.isFinite(qty) && qty > 0;

  React.useEffect(() => {
    if (debouncedQty === qtyParam) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedQty) next.set("qty", debouncedQty);
    else next.delete("qty");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQty]);

  function handleSelectSku(product: Product) {
    const next = new URLSearchParams(searchParams);
    next.set("sku", product.sku);
    setSearchParams(next, { replace: true });
  }

  const { data, isPending, isError, error } = useSkuExplosion(sku ?? undefined, hasValidQty ? qty : undefined);

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-primary">BOM Explosion — What If</h1>
        <p className="text-sm text-ink-muted">Ad-hoc planning calculator.</p>
      </div>

      <Alert variant="info" className="mb-5">
        <Info />
        <AlertTitle>This is a hypothetical calculation</AlertTitle>
        <AlertDescription>
          Nothing here is saved or tied to any real order. For a real order&apos;s actual material requirements and
          shortage status, see that order&apos;s detail page instead.
        </AlertDescription>
      </Alert>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Label className="mb-1.5 block">SKU</Label>
          <SkuCombobox value={sku} onSelect={handleSelectSku} />
        </div>
        <div className="w-40">
          <Label htmlFor="qty" className="mb-1.5 block">
            Quantity
          </Label>
          <Input
            id="qty"
            type="number"
            min={1}
            step={1}
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            placeholder="e.g. 100"
          />
        </div>
        {sku && (
          <Button variant="outline" asChild>
            <Link to={`/bom?sku=${encodeURIComponent(sku)}`}>Edit this SKU&apos;s BOM</Link>
          </Button>
        )}
      </div>

      {!sku || !hasValidQty ? (
        <div className="rounded-md border border-surface-border bg-surface-raised">
          <EmptyState
            icon={Calculator}
            title="Select a SKU and enter a quantity"
            description="Both are required to run the what-if calculation."
          />
        </div>
      ) : (
        <>
          {isError && (
            <Alert variant="critical" className="mb-4">
              <TriangleAlert />
              <AlertTitle>Couldn&apos;t run the explosion</AlertTitle>
              <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
            </Alert>
          )}

          {isPending && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {data && data.lines.length === 0 && (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState icon={Calculator} title="No BOM defined for this SKU" description="Add components to this SKU's BOM first." />
            </div>
          )}

          {data && data.lines.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-ink-muted">
                {data.totalLines} part{data.totalLines === 1 ? "" : "s"} required to build {formatNumber(data.qty)} ×{" "}
                <span className="font-mono">{data.sku}</span>
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Name</TableHead>
                    <TableHead className="text-right">Qty per Unit</TableHead>
                    <TableHead className="text-right">Required Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((line) => (
                    <TableRow key={line.partId ?? line.partName}>
                      <TableCell>
                        {line.partId ? (
                          <Link to={`/rm-inventory/${encodeURIComponent(line.partId)}`} className="text-signal-amber hover:underline">
                            {line.partName}
                          </Link>
                        ) : (
                          line.partName
                        )}
                      </TableCell>
                      <TableCell numeric>{formatNumber(line.qtyPerUnit)}</TableCell>
                      <TableCell numeric>{formatNumber(line.requiredQty)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
