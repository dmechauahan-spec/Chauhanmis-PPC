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
    // Client Flow Part 1 — the link this whole 5-part addition's Order ->
    // Plan -> Actual -> QC chain depends on (Parts 2/3/5 all read "this
    // order's" production off it). Free text, not a picker, for the same
    // reason as QC Inspections' own Order ID field (see
    // qc-inspection-schema.ts) — validated server-side either way.
    orderId: z.string().optional(),
    totalEmployees: optionalCoercedNumber(z.number().int().nonnegative()),
    presentEmployees: optionalCoercedNumber(z.number().int().nonnegative()),
    plannedMinutes: optionalCoercedNumber(z.number().nonnegative()),
    totalOutputQty: optionalCoercedNumber(z.number().nonnegative()),
    goodQty: optionalCoercedNumber(z.number().nonnegative()),
    // Self-reported by production, distinct from QC's own authoritative
    // pass/reject/rework numbers (Part 3's QC Inspections) — see README
    // "Client Flow Part 1". Never conflated with QC's figures anywhere in
    // this app.
    rejectedQty: optionalCoercedNumber(z.number().nonnegative()),
    reworkQty: optionalCoercedNumber(z.number().nonnegative()),
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
