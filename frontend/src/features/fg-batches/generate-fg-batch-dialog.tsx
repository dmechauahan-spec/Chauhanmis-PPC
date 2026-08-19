import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate } from "react-router";
import { TriangleAlert, PackagePlus } from "lucide-react";
import { useGenerateFgBatch } from "./use-fg-batches";
import { useWarehousesForPicker } from "@/features/warehouses/use-warehouses";
import { PLYWOOD_GRADES } from "@/features/admin/product-schema";
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
import type { PlywoodGrade, Product, QcInspection } from "@/types/api";

interface FormValues {
  warehouseId: string;
  rackBinLocation: string;
  productionDate: string;
  plywoodGrade: PlywoodGrade | "";
  thickness: string;
  sheetLength: string;
  sheetWidth: string;
}

interface GenerateFgBatchDialogProps {
  inspection: QcInspection;
  /** The inspection's order's product, if resolvable — seeds the plywood-attribute overrides with the product's own defaults. */
  product?: Product;
  trigger: React.ReactNode;
}

// Client Flow Part 3 -> FG Module Part 1. The ONLY way an FgBatch is ever
// created — reached from a QC Inspection with passedQty > 0 that hasn't
// already been converted (see qc-inspection-detail-page.tsx). Every
// production/order-derived field (productionOrderId, customer, productName,
// sku) is server-derived, never accepted here — only warehouse placement,
// production date, and plywood-attribute overrides are.
export function GenerateFgBatchDialog({ inspection, product, trigger }: GenerateFgBatchDialogProps) {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const generate = useGenerateFgBatch();
  const { data: warehouses } = useWarehousesForPicker();

  function buildDefaults(): FormValues {
    return {
      warehouseId: "",
      rackBinLocation: "",
      productionDate: inspection.inspectionDate.slice(0, 10),
      plywoodGrade: product?.plywoodGrade ?? "",
      thickness: product?.thickness ?? "",
      sheetLength: product?.sheetLength ?? "",
      sheetWidth: product?.sheetWidth ?? "",
    };
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: buildDefaults() });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(buildDefaults());
  }

  async function onSubmit(values: FormValues) {
    try {
      const batch = await generate.mutateAsync({
        qcInspectionId: inspection.id,
        warehouseId: values.warehouseId || undefined,
        rackBinLocation: values.rackBinLocation.trim() || undefined,
        productionDate: values.productionDate || undefined,
        plywoodGrade: values.plywoodGrade || undefined,
        thickness: values.thickness ? Number(values.thickness) : undefined,
        sheetLength: values.sheetLength ? Number(values.sheetLength) : undefined,
        sheetWidth: values.sheetWidth ? Number(values.sheetWidth) : undefined,
      });
      setOpen(false);
      navigate(`/fg-batches/${batch.fgBatchNo}`);
    } catch {
      // Surfaced below via generate.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="size-4" />
            Generate FG Batch
          </DialogTitle>
          <DialogDescription>
            Converts this QC-passed inspection ({inspection.passedQty} passed) into a traceable, dispatch-eligible FG
            batch. Product and order fields are derived from the inspection automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {generate.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(generate.error)}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="warehouseId">Warehouse (optional)</Label>
                <Controller
                  control={control}
                  name="warehouseId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="warehouseId">
                        <SelectValue placeholder="Unassigned" />
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
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rackBinLocation">Bin (optional)</Label>
                <Input id="rackBinLocation" placeholder="Rack 3 Bin B" {...register("rackBinLocation")} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="productionDate">Production Date</Label>
              <Input id="productionDate" type="date" {...register("productionDate")} />
              <p className="text-xs text-ink-faint">Defaults to this inspection&apos;s own date.</p>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-sunken p-3">
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                Plywood Attributes {product ? "(defaults from the product — override if this batch differs)" : "(optional)"}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plywoodGrade">Grade</Label>
                  <Controller
                    control={control}
                    name="plywoodGrade"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="plywoodGrade">
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          {PLYWOOD_GRADES.map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="thickness">Thickness (mm)</Label>
                  <Input id="thickness" type="number" min={0} step="0.1" {...register("thickness")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sheetLength">Sheet Length (mm)</Label>
                  <Input id="sheetLength" type="number" min={0} step="0.1" {...register("sheetLength")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sheetWidth">Sheet Width (mm)</Label>
                  <Input id="sheetWidth" type="number" min={0} step="0.1" {...register("sheetWidth")} />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Generating…" : "Generate FG Batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
