import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useCreateBomComponent, useUpdateBomComponent } from "./use-bom";
import { componentFormSchema, type ComponentFormInput, type ComponentFormValues } from "./bom-schema";
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
import type { BomComponentRow, BomUom } from "@/types/api";

const UOM_OPTIONS: BomUom[] = ["Pcs", "Set", "Kg", "Ltr", "Mtr"];

interface ComponentFormDialogProps {
  modelRef: string;
  /** Present = editing this row; absent = creating a new one. */
  component?: BomComponentRow;
  trigger: React.ReactNode;
}

/** One dialog, shared between Add Component and each row's Edit action — same reuse-over-duplication call as the RM Inventory panels. */
export function ComponentFormDialog({ modelRef, component, trigger }: ComponentFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const isEditing = !!component;
  const createComponent = useCreateBomComponent();
  const updateComponent = useUpdateBomComponent(modelRef);
  const mutation = isEditing ? updateComponent : createComponent;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ComponentFormInput, unknown, ComponentFormValues>({
    resolver: zodResolver(componentFormSchema),
    defaultValues: {
      partName: component?.partName ?? "",
      uom: component?.uom ?? "Pcs",
      qtyPerUnit: component ? Number(component.qtyPerUnit) : 1,
      partId: component?.partId ?? "",
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset({
        partName: component?.partName ?? "",
        uom: component?.uom ?? "Pcs",
        qtyPerUnit: component ? Number(component.qtyPerUnit) : 1,
        partId: component?.partId ?? "",
      });
    }
  }

  async function onSubmit(values: ComponentFormValues) {
    const partId = values.partId?.trim() || undefined;
    try {
      if (isEditing) {
        await updateComponent.mutateAsync({
          id: component.id,
          payload: { partName: values.partName, uom: values.uom, qtyPerUnit: values.qtyPerUnit, partId },
        });
      } else {
        await createComponent.mutateAsync({
          modelRef,
          partName: values.partName,
          uom: values.uom,
          qtyPerUnit: values.qtyPerUnit,
          partId,
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
          <DialogTitle>{isEditing ? "Edit Component" : "Add Component"}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Editing a component of ${modelRef}.` : `Adds a new component to ${modelRef}'s BOM.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {mutation.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(mutation.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partName">Part Name</Label>
              <Input id="partName" aria-invalid={!!errors.partName} {...register("partName")} />
              {errors.partName && <p className="text-xs text-status-critical">{errors.partName.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="uom">UOM</Label>
                <Controller
                  control={control}
                  name="uom"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="uom">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UOM_OPTIONS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qtyPerUnit">Qty per Unit</Label>
                <Input
                  id="qtyPerUnit"
                  type="number"
                  step="any"
                  min={0}
                  aria-invalid={!!errors.qtyPerUnit}
                  {...register("qtyPerUnit")}
                />
                {errors.qtyPerUnit && <p className="text-xs text-status-critical">{errors.qtyPerUnit.message}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partId">RM Inventory Part ID (optional)</Label>
              <Input
                id="partId"
                placeholder="Leave blank if this component isn't tracked in RM Inventory"
                aria-invalid={!!errors.partId}
                {...register("partId")}
              />
              <p className="text-xs text-ink-faint">Must exactly match an existing RM Inventory part ID.</p>
              {errors.partId && <p className="text-xs text-status-critical">{errors.partId.message}</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Add Component"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
