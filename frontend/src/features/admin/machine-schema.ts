import { z } from "zod";
import { optionalCoercedNumber } from "@/lib/zod-helpers";

export const MACHINE_STATUSES = ["Active", "Offline", "Maintenance"] as const;

// Mirrors ppc-backend's machines.schema.ts#createMachineSchema — client-side
// copy for immediate form feedback, not a replacement for the backend's own
// (authoritative) validation, which still runs on submit regardless. The
// "at least one capacity field" rule mirrors the backend's
// hasAtLeastOneCapacity refine exactly.
export const machineFormSchema = z
  .object({
    machineId: z.string().min(1, "Machine ID is required"),
    machineName: z.string().min(1, "Machine name is required"),
    lineId: z.string().min(1, "Select a line"),
    capacityPerHour: optionalCoercedNumber(z.number().positive("Must be > 0")),
    capacityPerShift: optionalCoercedNumber(z.number().positive("Must be > 0")),
    capacityPerDay: optionalCoercedNumber(z.number().positive("Must be > 0")),
    status: z.enum(MACHINE_STATUSES),
    notes: z.string().optional(),
  })
  .refine(
    (data) =>
      data.capacityPerHour !== undefined || data.capacityPerShift !== undefined || data.capacityPerDay !== undefined,
    {
      message: "Enter at least one capacity value (per hour, per shift, or per day)",
      path: ["capacityPerHour"],
    },
  );

export type MachineFormInput = z.input<typeof machineFormSchema>;
export type MachineFormValues = z.output<typeof machineFormSchema>;
