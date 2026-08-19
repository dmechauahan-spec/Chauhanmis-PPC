import { z } from "zod";

// Mirrors ppc-backend's warehouses.schema.ts — client-side copy for
// immediate form feedback, not a replacement for the backend's own
// (authoritative) validation.
export const warehouseFormSchema = z.object({
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  warehouseName: z.string().min(1, "Warehouse name is required"),
  location: z.string().optional(),
  isActive: z.boolean(),
});

export type WarehouseFormInput = z.input<typeof warehouseFormSchema>;
export type WarehouseFormValues = z.output<typeof warehouseFormSchema>;
