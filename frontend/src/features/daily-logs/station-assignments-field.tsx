import { useFieldArray, type Control, type UseFormRegister, type FieldErrors } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DailyLogFormInput } from "./daily-log-schema";

interface StationAssignmentsFieldProps {
  control: Control<DailyLogFormInput>;
  register: UseFormRegister<DailyLogFormInput>;
  errors: FieldErrors<DailyLogFormInput>;
}

// The backend shape is { "Element": ["ajit","suresh"], "Pully": [...] } — a
// plain station-name input plus a comma-separated names input is enough
// for this (no per-worker validation against a real roster exists to
// justify a fancier tag-input widget), split into the array shape on
// submit (see daily-log-payload.ts).
export function StationAssignmentsField({ control, register, errors }: StationAssignmentsFieldProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "stationAssignments" });

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-sm text-ink-muted">No station assignments recorded for this entry.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map((field, index) => {
            const rowErrors = errors.stationAssignments?.[index];
            return (
              <div
                key={field.id}
                className="grid grid-cols-[180px_1fr_auto] items-start gap-2 rounded-md border border-surface-border bg-surface-sunken p-3"
              >
                <div className="flex flex-col gap-1">
                  <Input
                    placeholder="Station (e.g. Element)"
                    aria-invalid={!!rowErrors?.station}
                    {...register(`stationAssignments.${index}.station`)}
                  />
                  {rowErrors?.station && <p className="text-xs text-status-critical">{rowErrors.station.message}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <Input
                    placeholder="Names, comma-separated (e.g. ajit, suresh)"
                    aria-invalid={!!rowErrors?.names}
                    {...register(`stationAssignments.${index}.names`)}
                  />
                  {rowErrors?.names && <p className="text-xs text-status-critical">{rowErrors.names.message}</p>}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove station assignment"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="text-status-critical" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => append({ station: "", names: "" })}>
        <Plus />
        Add Station
      </Button>
    </div>
  );
}
