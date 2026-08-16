import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

const priorityEnum = z.enum(['Low', 'Medium', 'High']);
// JS-safe identifiers for the Postgres order_status enum (spaces mapped via
// @map in schema.prisma — see README "Assumptions").
const statusEnum = z.enum(['Open', 'PendingRM', 'Scheduled', 'Running', 'QC', 'DispatchReady', 'Closed']);

export const orderParamsSchema = z.object({
  orderId: z.string().min(1),
});

function isTodayOrFuture(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  return date.getTime() >= today.getTime();
}

export const createOrderSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  client: z.string().min(1, 'client is required'),
  sku: z.string().min(1, 'sku is required'),
  qty: z.coerce.number().int().positive('qty must be > 0'),
  dueDate: z
    .string()
    .refine((val) => !Number.isNaN(Date.parse(val)), { message: 'dueDate must be a valid date' })
    .refine(isTodayOrFuture, { message: 'dueDate must be today or in the future' })
    .optional(),
  priority: priorityEnum.default('Medium'),
  // Client Flow Part 1 — free-text, no other logic attached. See README.
  specialRequirements: z.string().optional(),
});

// Client Flow Part 1 — general field update, separate from the dedicated
// status-transition endpoint (PATCH /:orderId/status) which has its own
// sequential-flow rules and stays untouched by this. Currently only covers
// specialRequirements; extend here if more freely-editable fields are added.
export const updateOrderSchema = z
  .object({
    specialRequirements: z.string().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  client: z.string().optional(),
  sku: z.string().optional(),
  sortBy: z.enum(['dueDate', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

// Client Flow Part 4B — delayReason/finalRemarks are accepted here
// unconditionally (not restricted to newStatus: 'Closed' via a discriminated
// union) for the simplest possible schema shape: orders.service.ts's
// updateOrderStatus only ever reads and persists them when the transition's
// target status is actually Closed (into order_closure_summaries); sent
// alongside any other transition, they're accepted by validation but
// silently have no effect — no error, no side effect anywhere. See README
// "Client Flow Part 4".
export const updateOrderStatusSchema = z.object({
  newStatus: statusEnum,
  delayReason: z.string().optional(),
  finalRemarks: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
