import { z } from "zod";
import { optionalCoercedNumber, optionalFromEmptyString } from "@/lib/zod-helpers";

// FG Module Part 1 — plywood-specific attributes, all optional (most
// products in this system aren't plywood) — mirrors ppc-backend's
// products.schema.ts's plywoodGradeEnum exactly.
export const PLYWOOD_GRADES = ["MR", "BWR", "BWP", "Other"] as const;

// Mirrors ppc-backend's products.schema.ts — client-side copy for
// immediate form feedback, not a replacement for the backend's own
// validation on submit.
export const productFormSchema = z.object({
  modelId: z.string().min(1, "Model ID is required"),
  modelName: z.string().min(1, "Model name is required"),
  productType: z.string().min(1, "Product type is required"),
  sku: z.string().min(1, "SKU is required"),
  taktTimeSec: z.coerce.number().positive("Takt time must be > 0"),
  manpowerRequired: z.coerce.number().int().positive("Manpower required must be > 0"),
  noOfStations: z.coerce.number().int().positive("No. of stations must be > 0"),
  changeoverTimeMin: optionalCoercedNumber(z.number().nonnegative()),
  notes: z.string().optional(),
  plywoodGrade: optionalFromEmptyString(z.enum(PLYWOOD_GRADES)),
  thickness: optionalCoercedNumber(z.number().positive()),
  sheetLength: optionalCoercedNumber(z.number().positive()),
  sheetWidth: optionalCoercedNumber(z.number().positive()),
});

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;
