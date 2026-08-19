import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { TriangleAlert, MoveRight } from "lucide-react";
import { useTransferFgBatch } from "./use-fg-batches";
import { useWarehousesForPicker } from "@/features/warehouses/use-warehouses";
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
import type { FgBatch, TransferFgBatchPayload } from "@/types/api";

interface FormValues {
  warehouseId: string;
  rackBinLocation: string;
  notes: string;
}

export function TransferFgBatchDialog({ batch, trigger }: { batch: FgBatch; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const transfer = useTransferFgBatch(batch.fgBatchNo);
  const { data: warehouses } = useWarehousesForPicker();
  const isFullyDispatched = batch.dispatchStatus === "Dispatched";

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { warehouseId: batch.warehouseId ?? "", rackBinLocation: batch.rackBinLocation ?? "", notes: "" },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset({ warehouseId: batch.warehouseId ?? "", rackBinLocation: batch.rackBinLocation ?? "", notes: "" });
  }

  async function onSubmit(values: FormValues) {
    if (!values.warehouseId) return;
    const payload: TransferFgBatchPayload = {
      warehouseId: values.warehouseId,
      rackBinLocation: values.rackBinLocation.trim() || undefined,
      notes: values.notes.trim() || undefined,
    };
    try {
      await transfer.mutateAsync(payload);
      setOpen(false);
    } catch {
      // Surfaced below via transfer.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer {batch.fgBatchNo}</DialogTitle>
          <DialogDescription>Move this batch to a different warehouse/bin.</DialogDescription>
        </DialogHeader>

        {isFullyDispatched ? (
          <DialogBody>
            <Alert variant="critical">
              <TriangleAlert />
              <AlertDescription>
                This batch has already been fully dispatched — it has physically left the warehouse and can no longer
                be transferred.
              </AlertDescription>
            </Alert>
          </DialogBody>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogBody className="flex flex-col gap-4">
              {transfer.isError && (
                <Alert variant="critical">
                  <TriangleAlert />
                  <AlertDescription>{apiErrorMessage(transfer.error)}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-2 rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                <span className="font-mono">{batch.warehouseId ? `${batch.warehouseId}${batch.rackBinLocation ? ` / ${batch.rackBinLocation}` : ""}` : "Unassigned"}</span>
                <MoveRight className="size-3.5 shrink-0" />
                <span className="text-ink-faint">destination below</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="warehouseId">Destination Warehouse</Label>
                  <Controller
                    control={control}
                    name="warehouseId"
                    rules={{ required: "Select a warehouse" }}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="warehouseId" aria-invalid={!!errors.warehouseId}>
                          <SelectValue placeholder="Select warehouse…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(warehouses ?? []).map((w) => (
                            <SelectItem key={w.warehouseId} value={w.warehouseId}>
                              {w.warehouseName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.warehouseId && <p className="text-xs text-status-critical">{errors.warehouseId.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rackBinLocation">Bin (optional)</Label>
                  <Input id="rackBinLocation" placeholder="Rack 3 Bin B" {...register("rackBinLocation")} />
                  <p className="text-xs text-ink-faint">Left blank clears the current bin.</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input id="notes" {...register("notes")} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Transferring…" : "Transfer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
