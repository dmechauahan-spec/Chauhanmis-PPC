import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useCreateProduct, useUpdateProduct } from "./use-products-admin";
import { PLYWOOD_GRADES, productFormSchema, type ProductFormInput, type ProductFormValues } from "./product-schema";
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
import type { Product } from "@/types/api";

interface ProductFormDialogProps {
  /** Present = editing this row; absent = creating a new one. */
  product?: Product;
  trigger: React.ReactNode;
}

/** One dialog, shared between Add and each row's Edit action — same pattern as BOM's ComponentFormDialog. */
export function ProductFormDialog({ product, trigger }: ProductFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const isEditing = !!product;
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const mutation = isEditing ? updateProduct : createProduct;

  function buildDefaults(): ProductFormInput {
    return {
      modelId: product?.modelId ?? "",
      modelName: product?.modelName ?? "",
      productType: product?.productType ?? "",
      sku: product?.sku ?? "",
      taktTimeSec: product ? Number(product.taktTimeSec) : 0,
      manpowerRequired: product?.manpowerRequired ?? 1,
      noOfStations: product?.noOfStations ?? 1,
      changeoverTimeMin: product?.changeoverTimeMin != null ? Number(product.changeoverTimeMin) : undefined,
      notes: product?.notes ?? "",
      // "" not undefined — a Radix Select must stay controlled from the
      // start (a value prop that's undefined on first render then a real
      // string after the user picks something trips React's "component is
      // changing from uncontrolled to controlled" warning). "" never
      // matches a real PLYWOOD_GRADES entry, so the trigger still shows
      // its placeholder exactly as undefined would have.
      plywoodGrade: product?.plywoodGrade ?? "",
      thickness: product?.thickness != null ? Number(product.thickness) : undefined,
      sheetLength: product?.sheetLength != null ? Number(product.sheetLength) : undefined,
      sheetWidth: product?.sheetWidth != null ? Number(product.sheetWidth) : undefined,
    };
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: buildDefaults(),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(buildDefaults());
  }

  async function onSubmit(values: ProductFormValues) {
    const notes = values.notes?.trim() || undefined;
    try {
      if (isEditing) {
        await updateProduct.mutateAsync({
          modelId: product.modelId,
          payload: {
            modelName: values.modelName,
            productType: values.productType,
            sku: values.sku,
            taktTimeSec: values.taktTimeSec,
            manpowerRequired: values.manpowerRequired,
            noOfStations: values.noOfStations,
            changeoverTimeMin: values.changeoverTimeMin ?? null,
            notes: notes ?? null,
            plywoodGrade: values.plywoodGrade ?? null,
            thickness: values.thickness ?? null,
            sheetLength: values.sheetLength ?? null,
            sheetWidth: values.sheetWidth ?? null,
          },
        });
      } else {
        await createProduct.mutateAsync({
          modelId: values.modelId,
          modelName: values.modelName,
          productType: values.productType,
          sku: values.sku,
          taktTimeSec: values.taktTimeSec,
          manpowerRequired: values.manpowerRequired,
          noOfStations: values.noOfStations,
          changeoverTimeMin: values.changeoverTimeMin,
          notes,
          plywoodGrade: values.plywoodGrade,
          thickness: values.thickness,
          sheetLength: values.sheetLength,
          sheetWidth: values.sheetWidth,
        });
      }
      setOpen(false);
    } catch {
      // Surfaced below via mutation.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Product" : "New Product"}</DialogTitle>
          <DialogDescription>{isEditing ? `Editing ${product.modelId}.` : "Adds a new Model Master entry."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {mutation.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(mutation.error)}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="modelId">Model ID</Label>
                <Input id="modelId" aria-invalid={!!errors.modelId} disabled={isEditing} {...register("modelId")} />
                {errors.modelId && <p className="text-xs text-status-critical">{errors.modelId.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" className="font-mono" aria-invalid={!!errors.sku} {...register("sku")} />
                {errors.sku && <p className="text-xs text-status-critical">{errors.sku.message}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modelName">Model Name</Label>
              <Input id="modelName" aria-invalid={!!errors.modelName} {...register("modelName")} />
              {errors.modelName && <p className="text-xs text-status-critical">{errors.modelName.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="productType">Product Type</Label>
              <Input id="productType" aria-invalid={!!errors.productType} {...register("productType")} />
              {errors.productType && <p className="text-xs text-status-critical">{errors.productType.message}</p>}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="taktTimeSec">Takt Time (sec)</Label>
                <Input id="taktTimeSec" type="number" min={0} step="0.1" aria-invalid={!!errors.taktTimeSec} {...register("taktTimeSec")} />
                {errors.taktTimeSec && <p className="text-xs text-status-critical">{errors.taktTimeSec.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manpowerRequired">Manpower</Label>
                <Input id="manpowerRequired" type="number" min={1} step={1} aria-invalid={!!errors.manpowerRequired} {...register("manpowerRequired")} />
                {errors.manpowerRequired && <p className="text-xs text-status-critical">{errors.manpowerRequired.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="noOfStations">Stations</Label>
                <Input id="noOfStations" type="number" min={1} step={1} aria-invalid={!!errors.noOfStations} {...register("noOfStations")} />
                {errors.noOfStations && <p className="text-xs text-status-critical">{errors.noOfStations.message}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="changeoverTimeMin">Changeover Time (min, optional)</Label>
              <Input id="changeoverTimeMin" type="number" min={0} step="0.1" {...register("changeoverTimeMin")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                rows={2}
                className="w-full rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-primary outline-none placeholder:text-ink-faint focus-visible:border-signal-amber/60 focus-visible:ring-2 focus-visible:ring-signal-amber/25"
                {...register("notes")}
              />
            </div>

            {/* FG Module Part 1 — plywood-specific attributes, all
                optional. Most products in this system aren't plywood, so
                this section stays visually secondary (a labeled group, not
                its own required block) rather than implying every product
                needs it filled in. */}
            <div className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-sunken p-3">
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Plywood Attributes (optional)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plywoodGrade">Grade</Label>
                  <Controller
                    control={control}
                    name="plywoodGrade"
                    render={({ field }) => (
                      // field.value's static type is `unknown` here — z.preprocess
                      // (see zod-helpers.ts's optionalFromEmptyString) can't
                      // know its own input shape, only its output — the cast
                      // reflects what buildDefaults()/onChange actually ever
                      // put there (a PlywoodGrade or "").
                      <Select value={(field.value as string | undefined) ?? ""} onValueChange={field.onChange}>
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
              {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
