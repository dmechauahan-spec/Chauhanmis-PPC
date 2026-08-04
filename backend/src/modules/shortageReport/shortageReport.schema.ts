import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

const priorityEnum = z.enum(['Low', 'Medium', 'High']);

// z.coerce.boolean() is a footgun for query strings — Boolean("false") is
// true, since any non-empty string is truthy. Enumerate the two literal
// strings instead so only ?overdueOnly=true actually turns it on; anything
// else (including omission) is false.
const booleanQueryFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const shortageReportQuerySchema = paginationQuerySchema.extend({
  priority: priorityEnum.optional(),
  overdueOnly: booleanQueryFlag,
});

export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
export type ShortageReportQuery = z.infer<typeof shortageReportQuerySchema>;
