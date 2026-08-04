import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

const priorityEnum = z.enum(['Low', 'Medium', 'High']);

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

export const listAtRiskOrdersQuerySchema = paginationQuerySchema.extend({
  priority: priorityEnum.optional(),
  lineId: z.string().optional(),
});

export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
export type ListAtRiskOrdersQuery = z.infer<typeof listAtRiskOrdersQuerySchema>;
