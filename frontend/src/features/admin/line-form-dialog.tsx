import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useCreateLine, useUpdateLine } from "./use-lines-admin";
import { lineFormSchema, productTypesToText, textToProductTypes, type LineFormInput, type LineFormValues } from "./line-schema";
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
import type { Line } from "@/types/api";

interface LineFormDialogProps {
  /** Present = editing this row; absent = creating a new one. */
  line?: Line;
  trigger: React.ReactNode;
}

/** One dialog, shared between Add and each row's Edit action. */
export function LineFormDialog({ line, trigger }: LineFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const isEditing = !!line;
  const createLine = useCreateLine();
  const updateLine = useUpdateLine();
  const mutation = isEditing ? updateLine : createLine;

  function buildDefaults(): LineFormInput {
    return {
      lineId: line?.lineId ?? "",
      lineName: line?.lineName ?? "",
      maxWorkers: line ? Number(line.maxWorkers) : 1,
      efficiencyPct: line ? Number(line.efficiencyPct) : 100,
      status: line?.status ?? "Active",
      capPerDay: line?.capPerDay != null ? Number(line.capPerDay) : undefined,
      notes: line?.notes ?? "",
      productTypes: productTypesToText(line?.productTypes ?? []),
    };
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LineFormInput, unknown, LineFormValues>({
    resolver: zodResolver(lineFormSchema),
    defaultValues: buildDefaults(),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(buildDefaults());
  }

  async function onSubmit(values: LineFormValues) {
    const notes = values.notes?.trim() || undefined;
    const productTypes = textToProductTypes(values.productTypes);
    try {
      if (isEditing) {
        await updateLine.mutateAsync({
          lineId: line.lineId,
          payload: {
            lineName: values.lineName,
            maxWorkers: values.maxWorkers,
            efficiencyPct: values.efficiencyPct,
            status: values.status,
            capPerDay: values.capPerDay ?? null,
            notes: notes ?? null,
            productTypes,
          },
        });
      } else {
        await createLine.mutateAsync({
          lineId: values.lineId,
          lineName: values.lineName,
          maxWorkers: values.maxWorkers,
          efficiencyPct: values.efficiencyPct,
          status: values.status,
          capPerDay: values.capPerDay,
          notes,
          productTypes,
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
          <DialogTitle>{isEditing ? "Edit Line" : "New Line"}</DialogTitle>
          <DialogDescription>{isEditing ? `Editing ${line.lineId}.` : "Adds a new production line."}</DialogDescription>
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
                <Label htmlFor="lineId">Line ID</Label>
                <Input id="lineId" aria-invalid={!!errors.lineId} disabled={isEditing} {...register("lineId")} />
                {errors.lineId && <p className="text-xs text-status-critical">{errors.lineId.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lineName">Line Name</Label>
                <Input id="lineName" aria-invalid={!!errors.lineName} {...register("lineName")} />
                {errors.lineName && <p className="text-xs text-status-critical">{errors.lineName.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxWorkers">Max Workers</Label>
                <Input id="maxWorkers" type="number" min={1} step={1} aria-invalid={!!errors.maxWorkers} {...register("maxWorkers")} />
                {errors.maxWorkers && <p className="text-xs text-status-critical">{errors.maxWorkers.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="efficiencyPct">Efficiency %</Label>
                <Input id="efficiencyPct" type="number" min={0} max={100} step="0.1" aria-invalid={!!errors.efficiencyPct} {...register("efficiencyPct")} />
                {errors.efficiencyPct && <p className="text-xs text-status-critical">{errors.efficiencyPct.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="status">Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Offline">Offline</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="capPerDay">Capacity per Day (optional)</Label>
              <Input id="capPerDay" type="number" min={0} step="0.1" {...register("capPerDay")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="productTypes">Compatible Product Types</Label>
              <Input id="productTypes" placeholder="e.g. OTG, Air Fryer" {...register("productTypes")} />
              <p className="text-xs text-ink-faint">Comma-separated. Leave blank if this line isn&apos;t restricted to specific product types.</p>
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
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Add Line"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
