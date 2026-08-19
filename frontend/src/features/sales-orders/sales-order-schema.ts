import { z } from "zod";

// Mirrors ppc-backend's salesOrders.schema.ts's createSalesOrderSchema —
// client-side copy for immediate form feedback. salesOrderNo IS
// client-supplied here (unlike fgBatchNo/dispatchNo, which are always
// server-generated) — same convention as orderId/warehouseId/teamId, see
// ppc-backend README "Assumptions".
export const salesOrderFormSchema = z.object({
  salesOrderNo: z.string().min(1, "Sales Order No. is required"),
  customer: z.string().min(1, "Customer is required"),
  sku: z.string().min(1, "SKU is required"),
  orderedQty: z.coerce.number().positive("Ordered Qty must be > 0"),
  dueDate: z.string().optional(),
});

export type SalesOrderFormInput = z.input<typeof salesOrderFormSchema>;
export type SalesOrderFormValues = z.output<typeof salesOrderFormSchema>;
