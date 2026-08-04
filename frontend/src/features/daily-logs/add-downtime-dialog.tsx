import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, TriangleAlert } from "lucide-react";
import { useAddDowntimeEntry } from "./use-daily-logs";
import { downtimeEntryFormSchema } from "./daily-log-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api-client";
import { DOWNTIME_REASONS } from "@/types/api";
import type { z } from "zod";

// z.coerce.number() makes the schema's input type differ from its output
// type (same reason create-order-schema.ts splits these) — useForm needs
// the pre-coercion input shape, zodResolver/handleSubmit hands back output.
type FormInput = z.input<typeof downtimeEntryFormSchema>;
type FormValues = z.output<typeof downtimeEntryFormSchema>;

export function AddDowntimeDialog({ logId }: { logId: string }) {
  const [open, setOpen] = React.useState(false);
  const addDowntime = useAddDowntimeEntry(logId);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(downtimeEntryFormSchema),
    defaultValues: { reason: "Material Not Available", minutes: 0, notes: "" },
  });
  const reason = watch("reason");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset({ reason: "Material Not Available", minutes: 0, notes: "" });
  }

  async function onSubmit(values: FormValues) {
    try {
      // The backend's notes field is `z.string().min(1).optional()` — an
      // empty string is a defined value that fails min(1), distinct from
      // omitting the key entirely. This form's own schema allows "" (no
      // min(1) client-side), so it must be stripped here before it's ever
      // sent, not just left to the resolver to catch.
      await addDowntime.mutateAsync({ ...values, notes: values.notes ? values.notes : undefined });
      setOpen(false);
    } catch {
      // Surfaced below via addDowntime.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Add Downtime
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Downtime Entry</DialogTitle>
          <DialogDescription>Adds immediately to this log — no need to save the log separately.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-3">
            {addDowntime.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(addDowntime.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dt-reason">Reason</Label>
              <Controller
                control={control}
                name="reason"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="dt-reason">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOWNTIME_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dt-minutes">Minutes</Label>
              <Input id="dt-minutes" type="number" min={0} step="0.5" aria-invalid={!!errors.minutes} {...register("minutes")} />
              {errors.minutes && <p className="text-xs text-status-critical">{errors.minutes.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dt-notes">Notes{reason === "Other" ? " (required)" : " (optional)"}</Label>
              <Input id="dt-notes" aria-invalid={!!errors.notes} {...register("notes")} />
              {errors.notes && <p className="text-xs text-status-critical">{errors.notes.message}</p>}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add Entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
