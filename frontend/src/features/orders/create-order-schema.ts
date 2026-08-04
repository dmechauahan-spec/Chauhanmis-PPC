import { z } from "zod";

function isTodayOrFuture(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  return date.getTime() >= today.getTime();
}

// Mirrors ppc-backend's orders.schema.ts#createOrderSchema — client-side
// copy for immediate form feedback, not a replacement for the backend's
// own (authoritative) validation, which still runs on submit regardless.
export const createOrderFormSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  client: z.string().min(1, "Client is required"),
  sku: z.string().min(1, "Select a SKU"),
  qty: z.coerce.number().int().positive("Quantity must be greater than 0"),
  dueDate: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), { message: "Enter a valid date" })
    .refine((val) => !val || isTodayOrFuture(val), { message: "Due date must be today or in the future" }),
  priority: z.enum(["Low", "Medium", "High"]),
});

// z.coerce.number() makes the schema's INPUT type (what react-hook-form's
// internal state actually holds pre-submit, e.g. a string from the number
// input) differ from its OUTPUT type (post-coercion) — useForm needs the
// input shape, zodResolver/handleSubmit hands back the output shape.
export type CreateOrderFormInput = z.input<typeof createOrderFormSchema>;
export type CreateOrderFormValues = z.output<typeof createOrderFormSchema>;
