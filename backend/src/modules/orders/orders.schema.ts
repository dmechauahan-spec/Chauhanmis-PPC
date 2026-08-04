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
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  client: z.string().optional(),
  sku: z.string().optional(),
  sortBy: z.enum(['dueDate', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const updateOrderStatusSchema = z.object({
  newStatus: statusEnum,
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
