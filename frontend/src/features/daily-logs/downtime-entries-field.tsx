import { useFieldArray, Controller, type Control, type UseFormRegister, type FieldErrors } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOWNTIME_REASONS } from "@/types/api";
import type { DailyLogFormInput } from "./daily-log-schema";

interface DowntimeEntriesFieldProps {
  control: Control<DailyLogFormInput>;
  register: UseFormRegister<DailyLogFormInput>;
  errors: FieldErrors<DailyLogFormInput>;
}

export function DowntimeEntriesField({ control, register, errors }: DowntimeEntriesFieldProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "downtimeEntries" });

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-sm text-ink-muted">No downtime recorded for this entry.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map((field, index) => {
            const rowErrors = errors.downtimeEntries?.[index];
            return (
              <div
                key={field.id}
                className="grid grid-cols-[1fr_120px_1fr_auto] items-start gap-2 rounded-md border border-surface-border bg-surface-sunken p-3"
              >
                <div className="flex flex-col gap-1">
                  <Controller
                    control={control}
                    name={`downtimeEntries.${index}.reason`}
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={f.onChange}>
                        <SelectTrigger aria-invalid={!!rowErrors?.reason}>
                          <SelectValue placeholder="Reason" />
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
                  {rowErrors?.reason && <p className="text-xs text-status-critical">{rowErrors.reason.message}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="Minutes"
                    aria-invalid={!!rowErrors?.minutes}
                    {...register(`downtimeEntries.${index}.minutes`)}
                  />
                  {rowErrors?.minutes && <p className="text-xs text-status-critical">{rowErrors.minutes.message}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <Input
                    placeholder="Notes (required if Other)"
                    aria-invalid={!!rowErrors?.notes}
                    {...register(`downtimeEntries.${index}.notes`)}
                  />
                  {rowErrors?.notes && <p className="text-xs text-status-critical">{rowErrors.notes.message}</p>}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove downtime entry"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="text-status-critical" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => append({ reason: "Material Not Available", minutes: 0, notes: "" })}
      >
        <Plus />
        Add Downtime Entry
      </Button>
    </div>
  );
}
