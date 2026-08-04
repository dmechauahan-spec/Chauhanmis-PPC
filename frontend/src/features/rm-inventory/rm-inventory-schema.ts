import { z } from "zod";

// Mirrors ppc-backend's rmInventory.schema.ts#createRmInventorySchema —
// client-side copy for immediate form feedback; the backend's own
// validation is still authoritative on submit.
export const createPartFormSchema = z.object({
  partId: z.string().min(1, "Part ID is required"),
  stock: z.coerce.number().nonnegative("Stock must be 0 or greater"),
  criticalThreshold: z
    .union([z.coerce.number().nonnegative("Threshold must be 0 or greater"), z.literal("")])
    .optional(),
});

export type CreatePartFormInput = z.input<typeof createPartFormSchema>;
export type CreatePartFormValues = z.output<typeof createPartFormSchema>;

// Mirrors rmInventory.schema.ts#adjustStockSchema.
export const adjustStockFormSchema = z.object({
  delta: z.coerce.number().refine((val) => val !== 0, { message: "Delta must be non-zero" }),
  reason: z.string().min(1, "Reason is required"),
});

export type AdjustStockFormInput = z.input<typeof adjustStockFormSchema>;
export type AdjustStockFormValues = z.output<typeof adjustStockFormSchema>;

// Mirrors materials.schema.ts#setCriticalThresholdSchema (the "set" side —
// "clear" is a distinct, unvalidated direct mutation, see
// critical-threshold-panel.tsx).
export const setThresholdFormSchema = z.object({
  criticalThreshold: z.coerce.number().nonnegative("Threshold must be 0 or greater"),
});

export type SetThresholdFormInput = z.input<typeof setThresholdFormSchema>;
export type SetThresholdFormValues = z.output<typeof setThresholdFormSchema>;
