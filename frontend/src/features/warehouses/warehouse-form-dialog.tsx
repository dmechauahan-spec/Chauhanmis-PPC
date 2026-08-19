import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useCreateWarehouse, useUpdateWarehouse } from "./use-warehouses";
import { warehouseFormSchema, type WarehouseFormInput, type WarehouseFormValues } from "./warehouse-schema";
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
import type { Warehouse } from "@/types/api";

interface WarehouseFormDialogProps {
  /** Present = editing this row; absent = creating a new one. */
  warehouse?: Warehouse;
  trigger: React.ReactNode;
}

/** One dialog, shared between Add and each row's Edit action — same pattern as Machines/Lines. */
export function WarehouseFormDialog({ warehouse, trigger }: WarehouseFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const isEditing = !!warehouse;
  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();
  const mutation = isEditing ? updateWarehouse : createWarehouse;

  function buildDefaults(): WarehouseFormInput {
    return {
      warehouseId: warehouse?.warehouseId ?? "",
      warehouseName: warehouse?.warehouseName ?? "",
      location: warehouse?.location ?? "",
      isActive: warehouse?.isActive ?? true,
    };
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseFormInput, unknown, WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: buildDefaults(),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(buildDefaults());
  }

  async function onSubmit(values: WarehouseFormValues) {
    const location = values.location?.trim() || undefined;
    try {
      if (isEditing) {
        await updateWarehouse.mutateAsync({
          warehouseId: warehouse.warehouseId,
          payload: {
            warehouseName: values.warehouseName,
            location: location ?? null,
            isActive: values.isActive,
          },
        });
      } else {
        await createWarehouse.mutateAsync({
          warehouseId: values.warehouseId,
          warehouseName: values.warehouseName,
          location,
          isActive: values.isActive,
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
          <DialogTitle>{isEditing ? "Edit Warehouse" : "New Warehouse"}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Editing ${warehouse.warehouseId}.` : "Adds a new warehouse location for FG stock."}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="warehouseId">Warehouse ID</Label>
                <Input
                  id="warehouseId"
                  placeholder="WH-01"
                  className="font-mono"
                  aria-invalid={!!errors.warehouseId}
                  disabled={isEditing}
                  {...register("warehouseId")}
                />
                {errors.warehouseId && <p className="text-xs text-status-critical">{errors.warehouseId.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="warehouseName">Warehouse Name</Label>
                <Input id="warehouseName" aria-invalid={!!errors.warehouseName} {...register("warehouseName")} />
                {errors.warehouseName && <p className="text-xs text-status-critical">{errors.warehouseName.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="location">Location (optional)</Label>
                <Input id="location" {...register("location")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="isActive">Status</Label>
                <Controller
                  control={control}
                  name="isActive"
                  render={({ field }) => (
                    <Select value={field.value ? "active" : "inactive"} onValueChange={(v) => field.onChange(v === "active")}>
                      <SelectTrigger id="isActive">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Add Warehouse"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
