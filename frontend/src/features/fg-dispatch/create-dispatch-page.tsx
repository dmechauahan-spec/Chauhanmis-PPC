import { useForm, useFieldArray, Controller } from "react-hook-form";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, TriangleAlert, Plus, Trash2, PackageCheck } from "lucide-react";
import { useCreateDispatch } from "./use-fg-dispatch";
import { useDispatchEligibleFgBatches } from "@/features/fg-batches/use-fg-batches";
import { useSalesOrdersForPicker } from "@/features/sales-orders/use-sales-orders";
import { SalesOrderStatusBadge } from "@/features/sales-orders/sales-order-badges";
import { FgStockStatusBadge } from "@/features/fg-batches/fg-batch-badges";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { DispatchEligibleFgBatch } from "@/types/api";

interface CartLineItem {
  fgBatchId: number;
  fgBatchNo: string;
  sku: string;
  productName: string;
  /** availableQty + reservedForSalesOrderQty at the moment it was added — the dispatchable ceiling this line item is validated against, same formula ppc-backend's own createDispatch uses. */
  ceiling: number;
  quantity: string;
}

interface FormValues {
  salesOrderId: string;
  notes: string;
  lineItems: CartLineItem[];
}

/**
 * The most complex form in this module — built as a cart/line-items
 * builder (per this part's own instructions), not a single dropdown:
 * pick an optional Sales Order (changes only SORT order of the eligible
 * list, never filters it — ppc-backend's own design, see
 * fg-batches/use-fg-batches.ts's useDispatchEligibleFgBatches), then add
 * one or more eligible batches with a quantity each, then submit as one
 * multi-line-item request.
 */
export function CreateDispatchPage() {
  const navigate = useNavigate();
  const createDispatch = useCreateDispatch();
  const { data: salesOrders } = useSalesOrdersForPicker();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { salesOrderId: "", notes: "", lineItems: [] } });

  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const salesOrderIdValue = watch("salesOrderId");
  const salesOrderId = salesOrderIdValue ? Number(salesOrderIdValue) : undefined;
  const selectedSalesOrder = salesOrders?.find((so) => String(so.id) === salesOrderIdValue);

  const { data: eligible, isPending: isEligiblePending, isError: isEligibleError } = useDispatchEligibleFgBatches({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    salesOrderId,
  });

  const inCart = new Set(fields.map((f) => f.fgBatchId));

  function addToCart(batch: DispatchEligibleFgBatch) {
    const ceiling = batch.availableQty + batch.reservedForSalesOrderQty;
    append({
      fgBatchId: batch.id,
      fgBatchNo: batch.fgBatchNo,
      sku: batch.sku,
      productName: batch.productName,
      ceiling,
      quantity: String(Math.min(ceiling, batch.qcPassedQty)),
    });
  }

  async function onSubmit(values: FormValues) {
    if (values.lineItems.length === 0) return;
    try {
      const dispatch = await createDispatch.mutateAsync({
        ...(values.salesOrderId ? { salesOrderId: Number(values.salesOrderId) } : {}),
        lineItems: values.lineItems.map((li) => ({ fgBatchId: li.fgBatchId, quantity: Number(li.quantity) })),
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      });
      navigate(`/fg-dispatches/${dispatch.dispatchNo}`);
    } catch {
      // Surfaced below via createDispatch.isError/error.
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <Link to="/fg-dispatches" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to Dispatches
      </Link>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        {createDispatch.isError && (
          <Alert variant="critical">
            <TriangleAlert />
            <AlertDescription>{apiErrorMessage(createDispatch.error)}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>New Dispatch</CardTitle>
            <CardDescription>
              Optionally tie this dispatch to a Sales Order — that draws down its own reservations first, before
              free available stock. Leave it unset for general/unaffiliated stock movement.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="salesOrderId">Sales Order (optional)</Label>
              <Controller
                control={control}
                name="salesOrderId"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <SelectTrigger id="salesOrderId">
                      <SelectValue placeholder="General stock movement" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">General stock movement (no Sales Order)</SelectItem>
                      {(salesOrders ?? [])
                        .filter((so) => so.status !== "Dispatched" && so.status !== "Closed")
                        .map((so) => (
                          <SelectItem key={so.id} value={String(so.id)}>
                            <span className="font-mono">{so.salesOrderNo}</span>
                            <span className="ml-1.5 text-ink-muted">{so.customer}</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {selectedSalesOrder && (
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                  <SalesOrderStatusBadge status={selectedSalesOrder.status} />
                  <span>SKU <span className="font-mono">{selectedSalesOrder.sku}</span></span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" {...register("notes")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eligible FG Batches</CardTitle>
            <CardDescription>
              {selectedSalesOrder
                ? "Batches carrying an Active reservation for this Sales Order are sorted first — every other eligible batch is still fully shown below."
                : "Not on Hold, QC-passed, with real undispatched quantity remaining."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isEligiblePending ? (
              <p className="text-sm text-ink-muted">Loading eligible batches…</p>
            ) : isEligibleError ? (
              <p className="text-sm text-status-critical">Couldn&apos;t load eligible batches.</p>
            ) : !eligible || eligible.items.length === 0 ? (
              <EmptyState icon={PackageCheck} title="No dispatch-eligible batches" description="Nothing is currently free to dispatch." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>FG Batch No</TableHead>
                      <TableHead>Product / SKU</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      {selectedSalesOrder && <TableHead className="text-right">Reserved for this SO</TableHead>}
                      <TableHead>Stock Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligible.items.map((batch) => (
                      <TableRow key={batch.fgBatchNo}>
                        <TableCell className="font-mono text-ink-primary">{batch.fgBatchNo}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{batch.productName}</span>
                            <span className="font-mono text-xs text-ink-muted">{batch.sku}</span>
                          </div>
                        </TableCell>
                        <TableCell numeric>{formatNumber(batch.availableQty)}</TableCell>
                        {selectedSalesOrder && (
                          <TableCell numeric className={batch.reservedForSalesOrderQty > 0 ? "text-status-info" : "text-ink-faint"}>
                            {formatNumber(batch.reservedForSalesOrderQty)}
                          </TableCell>
                        )}
                        <TableCell>
                          <FgStockStatusBadge status={batch.stockStatus} />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant={inCart.has(batch.id) ? "ghost" : "outline"}
                            size="sm"
                            disabled={inCart.has(batch.id)}
                            onClick={() => addToCart(batch)}
                          >
                            {inCart.has(batch.id) ? (
                              "In Dispatch"
                            ) : (
                              <>
                                <Plus />
                                Add
                              </>
                            )}
                          </Button>
                        </TableCell>
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
            <CardTitle>Dispatch Line Items ({fields.length})</CardTitle>
            <CardDescription>Each batch&apos;s quantity is validated against its own dispatchable ceiling before submit.</CardDescription>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <EmptyState icon={Plus} title="No batches added yet" description="Add at least one eligible batch above." />
            ) : (
              <div className="flex flex-col gap-2">
                {fields.map((field, index) => (
                  <CartRow key={field.id} index={index} item={field} register={register} errors={errors} watch={watch} onRemove={() => remove(index)} />
                ))}
              </div>
            )}
            {errors.lineItems && typeof errors.lineItems.message === "string" && (
              <p className="mt-2 text-xs text-status-critical">{errors.lineItems.message}</p>
            )}
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/fg-dispatches")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || fields.length === 0}>
              {isSubmitting ? "Creating…" : `Create Dispatch (${fields.length} item${fields.length === 1 ? "" : "s"})`}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

function CartRow({
  index,
  item,
  register,
  errors,
  watch,
  onRemove,
}: {
  index: number;
  item: CartLineItem;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  watch: ReturnType<typeof useForm<FormValues>>["watch"];
  onRemove: () => void;
}) {
  const quantity = watch(`lineItems.${index}.quantity`);
  const qtyNumber = Number(quantity);
  const exceedsCeiling = quantity !== "" && Number.isFinite(qtyNumber) && qtyNumber > item.ceiling;
  const rowError = errors.lineItems?.[index]?.quantity;

  return (
    <div className="grid grid-cols-[1fr_140px_auto] items-start gap-3 rounded-md border border-surface-border bg-surface-sunken p-3">
      <div>
        <p className="font-mono text-sm text-ink-primary">{item.fgBatchNo}</p>
        <p className="text-xs text-ink-muted">
          {item.productName} · <span className="font-mono">{item.sku}</span> · ceiling {formatNumber(item.ceiling)}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Input
          type="number"
          min={0}
          step="0.01"
          max={item.ceiling}
          aria-invalid={exceedsCeiling || !!rowError}
          {...register(`lineItems.${index}.quantity`, {
            required: "Required",
            validate: (v) => (Number(v) > 0 ? (Number(v) <= item.ceiling ? true : `Exceeds ceiling of ${formatNumber(item.ceiling)}`) : "Must be > 0"),
          })}
        />
        {(rowError || exceedsCeiling) && (
          <p className="text-xs text-status-critical">{rowError?.message ?? `Exceeds ceiling of ${formatNumber(item.ceiling)}`}</p>
        )}
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.fgBatchNo}`} onClick={onRemove}>
        <Trash2 className="text-status-critical" />
      </Button>
    </div>
  );
}
