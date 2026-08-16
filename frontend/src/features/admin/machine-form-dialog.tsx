import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useCreateMachine, useUpdateMachine } from "./use-machines-admin";
import { machineFormSchema, MACHINE_STATUSES, type MachineFormInput, type MachineFormValues } from "./machine-schema";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
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
import type { Machine } from "@/types/api";

interface MachineFormDialogProps {
  /** Present = editing this row; absent = creating a new one. */
  machine?: Machine;
  trigger: React.ReactNode;
}

/** One dialog, shared between Add and each row's Edit action. */
export function MachineFormDialog({ machine, trigger }: MachineFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const isEditing = !!machine;
  const createMachine = useCreateMachine();
  const updateMachine = useUpdateMachine();
  const mutation = isEditing ? updateMachine : createMachine;
  const { data: lines } = useLinesForFilter();

  function buildDefaults(): MachineFormInput {
    return {
      machineId: machine?.machineId ?? "",
      machineName: machine?.machineName ?? "",
      lineId: machine?.lineId ?? "",
      capacityPerHour: machine?.capacityPerHour != null ? Number(machine.capacityPerHour) : undefined,
      capacityPerShift: machine?.capacityPerShift != null ? Number(machine.capacityPerShift) : undefined,
      capacityPerDay: machine?.capacityPerDay != null ? Number(machine.capacityPerDay) : undefined,
      status: machine?.status ?? "Active",
      notes: machine?.notes ?? "",
    };
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MachineFormInput, unknown, MachineFormValues>({
    resolver: zodResolver(machineFormSchema),
    defaultValues: buildDefaults(),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(buildDefaults());
  }

  async function onSubmit(values: MachineFormValues) {
    const notes = values.notes?.trim() || undefined;
    try {
      if (isEditing) {
        await updateMachine.mutateAsync({
          machineId: machine.machineId,
          payload: {
            machineName: values.machineName,
            lineId: values.lineId,
            capacityPerHour: values.capacityPerHour ?? null,
            capacityPerShift: values.capacityPerShift ?? null,
            capacityPerDay: values.capacityPerDay ?? null,
            status: values.status,
            notes: notes ?? null,
          },
        });
      } else {
        await createMachine.mutateAsync({
          machineId: values.machineId,
          machineName: values.machineName,
          lineId: values.lineId,
          capacityPerHour: values.capacityPerHour,
          capacityPerShift: values.capacityPerShift,
          capacityPerDay: values.capacityPerDay,
          status: values.status,
          notes,
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
          <DialogTitle>{isEditing ? "Edit Machine" : "New Machine"}</DialogTitle>
          <DialogDescription>{isEditing ? `Editing ${machine.machineId}.` : "Adds a new machine to a production line."}</DialogDescription>
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
                <Label htmlFor="machineId">Machine ID</Label>
                <Input id="machineId" placeholder="M-01" aria-invalid={!!errors.machineId} disabled={isEditing} {...register("machineId")} />
                {errors.machineId && <p className="text-xs text-status-critical">{errors.machineId.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="machineName">Machine Name</Label>
                <Input id="machineName" aria-invalid={!!errors.machineName} {...register("machineName")} />
                {errors.machineName && <p className="text-xs text-status-critical">{errors.machineName.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lineId">Line</Label>
                <Controller
                  control={control}
                  name="lineId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="lineId" aria-invalid={!!errors.lineId}>
                        <SelectValue placeholder="Select line…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(lines ?? []).map((l) => (
                          <SelectItem key={l.lineId} value={l.lineId}>
                            {l.lineName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.lineId && <p className="text-xs text-status-critical">{errors.lineId.message}</p>}
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
                        {MACHINE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Capacity (at least one required)</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="capacityPerHour" className="text-xs font-normal text-ink-muted">
                    Per Hour
                  </Label>
                  <Input id="capacityPerHour" type="number" min={0} step="0.1" {...register("capacityPerHour")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="capacityPerShift" className="text-xs font-normal text-ink-muted">
                    Per Shift
                  </Label>
                  <Input id="capacityPerShift" type="number" min={0} step="0.1" {...register("capacityPerShift")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="capacityPerDay" className="text-xs font-normal text-ink-muted">
                    Per Day
                  </Label>
                  <Input id="capacityPerDay" type="number" min={0} step="0.1" {...register("capacityPerDay")} />
                </div>
              </div>
              {errors.capacityPerHour && <p className="text-xs text-status-critical">{errors.capacityPerHour.message}</p>}
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
              {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Add Machine"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
