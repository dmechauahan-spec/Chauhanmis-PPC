import { z } from "zod";
import { optionalCoercedNumber } from "@/lib/zod-helpers";

// productTypes is a comma-separated text input, split into the backend's
// string[] shape at submit time — same "plain text input, not a fancier
// multi-select widget" call as Daily Logs' station assignments (see
// station-assignments-field.tsx), since there's no fixed enum of product
// types to pick from (a line's compatibility list can name a product type
// before any Product row using it exists).
export const lineFormSchema = z.object({
  lineId: z.string().min(1, "Line ID is required"),
  lineName: z.string().min(1, "Line name is required"),
  maxWorkers: z.coerce.number().int().positive("Max workers must be > 0"),
  efficiencyPct: z.coerce.number().min(0, "Must be 0-100").max(100, "Must be 0-100"),
  status: z.enum(["Active", "Offline"]),
  capPerDay: optionalCoercedNumber(z.number().nonnegative()),
  notes: z.string().optional(),
  productTypes: z.string().optional(),
});

export type LineFormInput = z.input<typeof lineFormSchema>;
export type LineFormValues = z.output<typeof lineFormSchema>;

export function productTypesToText(productTypes: string[]): string {
  return productTypes.join(", ");
}

export function textToProductTypes(text: string | undefined): string[] {
  if (!text) return [];
  return [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))];
}
