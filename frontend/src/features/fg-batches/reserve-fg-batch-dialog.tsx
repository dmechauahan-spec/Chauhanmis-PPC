import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { TriangleAlert } from "lucide-react";
import { useReserveFgBatch } from "./use-fg-batches";
import { useSalesOrdersForPicker } from "@/features/sales-orders/use-sales-orders";
import { SalesOrderStatusBadge } from "@/features/sales-orders/sales-order-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import type { FgBatch } from "@/types/api";

interface FormValues {
  salesOrderId: string;
  qty: string;
}

export function ReserveFgBatchDialog({ batch, trigger }: { batch: FgBatch; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const reserve = useReserveFgBatch(batch.fgBatchNo);
  const { data: salesOrders } = useSalesOrdersForPicker();

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { salesOrderId: "", qty: "" } });

  const salesOrderId = watch("salesOrderId");
  const qty = watch("qty");
  const selectedSalesOrder = salesOrders?.find((so) => String(so.id) === salesOrderId);
  // Client-side check against Available Qty before submit — the backend
  // still has final say (it re-checks against the batch's CURRENT
  // availableQty at write time, which may have moved since this page
  // loaded), so this is a fast-feedback guard, not the real enforcement.
  const qtyNumber = Number(qty);
  const exceedsAvailable = qty !== "" && Number.isFinite(qtyNumber) && qtyNumber > batch.availableQty;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset({ salesOrderId: "", qty: "" });
  }

  async function onSubmit(values: FormValues) {
    if (!values.salesOrderId || !selectedSalesOrder) return;
    try {
      await reserve.mutateAsync({
        payload: { salesOrderId: Number(values.salesOrderId), qty: Number(values.qty) },
        salesOrderNo: selectedSalesOrder.salesOrderNo,
      });
      setOpen(false);
    } catch {
      // Surfaced below via reserve.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserve {batch.fgBatchNo}</DialogTitle>
          <DialogDescription>Set aside stock from this batch against a Sales Order.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {reserve.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(reserve.error)}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border border-surface-border bg-surface-sunken px-3 py-2">
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Available Now</p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-signal-amber">{formatNumber(batch.availableQty)}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="salesOrderId">Sales Order</Label>
              <Controller
                control={control}
                name="salesOrderId"
                rules={{ required: "Select a Sales Order" }}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="salesOrderId" aria-invalid={!!errors.salesOrderId}>
                      <SelectValue placeholder="Select Sales Order…" />
                    </SelectTrigger>
                    <SelectContent>
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
              {errors.salesOrderId && <p className="text-xs text-status-critical">{errors.salesOrderId.message}</p>}
              {selectedSalesOrder && (
                <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                  <SalesOrderStatusBadge status={selectedSalesOrder.status} />
                  <span>
                    Ordered {formatNumber(Number(selectedSalesOrder.orderedQty))} · SKU{" "}
                    <span className="font-mono">{selectedSalesOrder.sku}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={0}
                step="0.01"
                max={batch.availableQty}
                aria-invalid={exceedsAvailable}
                {...register("qty", { required: "Enter a quantity" })}
              />
              {errors.qty && <p className="text-xs text-status-critical">{errors.qty.message}</p>}
              {exceedsAvailable && (
                <p className="text-xs text-status-critical">
                  Only {formatNumber(batch.availableQty)} is available on this batch right now.
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || exceedsAvailable}>
              {isSubmitting ? "Reserving…" : "Reserve"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
