import { z } from "zod";
import { DOWNTIME_REASONS } from "@/types/api";
import { optionalCoercedNumber } from "@/lib/zod-helpers";

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

// Mirrors ppc-backend's dailyLogs.schema.ts#downtimeEntryInputSchema.
export const downtimeEntryFormSchema = z
  .object({
    reason: z.enum(DOWNTIME_REASONS),
    minutes: z.coerce.number().positive("Minutes must be greater than 0"),
    notes: z.string().optional(),
  })
  .refine((data) => data.reason !== "Other" || !!data.notes?.trim(), {
    message: "Notes are required when reason is 'Other'",
    path: ["notes"],
  });

// A station name plus a comma-separated list of worker names — split into
// the backend's { "Element": ["ajit","suresh"] } shape at submit time (see
// daily-log-payload.ts), not modeled as a real array field here since a
// plain comma-separated text input is enough for this data (see README
// "Module 3" — no per-worker validation against a real roster exists).
export const stationAssignmentRowSchema = z.object({
  station: z.string().min(1, "Station name is required"),
  names: z.string().min(1, "Enter at least one name, comma-separated"),
});

// Mirrors ppc-backend's dailyLogs.schema.ts#createDailyLogSchema's own
// refinements (presentEmployees <= totalEmployees, goodQty <=
// totalOutputQty) — client-side copy for immediate feedback, not a
// replacement for the backend's authoritative validation on submit.
// Shared by both create and edit forms; downtimeEntries is only ever
// rendered/submitted in create mode (PATCH has no field for it — downtime
// entries are managed via their own POST/DELETE sub-resource endpoints).
export const dailyLogFormSchema = z
  .object({
    logDate: z.string().min(1, "Date is required").refine(isValidDateString, { message: "Enter a valid date" }),
    shift: z.string().optional(),
    lineId: z.string().optional(),
    modelId: z.string().optional(),
    totalEmployees: optionalCoercedNumber(z.number().int().nonnegative()),
    presentEmployees: optionalCoercedNumber(z.number().int().nonnegative()),
    plannedMinutes: optionalCoercedNumber(z.number().nonnegative()),
    totalOutputQty: optionalCoercedNumber(z.number().nonnegative()),
    goodQty: optionalCoercedNumber(z.number().nonnegative()),
    notes: z.string().optional(),
    downtimeEntries: z.array(downtimeEntryFormSchema).optional(),
    stationAssignments: z.array(stationAssignmentRowSchema).optional(),
  })
  .refine(
    (data) =>
      data.totalEmployees === undefined ||
      data.presentEmployees === undefined ||
      data.presentEmployees <= data.totalEmployees,
    { message: "Present employees cannot exceed total employees", path: ["presentEmployees"] },
  )
  .refine(
    (data) => data.goodQty === undefined || data.totalOutputQty === undefined || data.goodQty <= data.totalOutputQty,
    { message: "Good qty cannot exceed total output qty", path: ["goodQty"] },
  );

export type DailyLogFormInput = z.input<typeof dailyLogFormSchema>;
export type DailyLogFormValues = z.output<typeof dailyLogFormSchema>;
