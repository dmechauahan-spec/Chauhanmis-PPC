import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

// Same JS-safe identifiers as orders.schema.ts's statusEnum (spaces mapped
// via @map in schema.prisma) — kept as an independent Zod literal here
// rather than importing the Prisma enum, matching that existing convention.
const orderStatusEnum = z.enum(['Open', 'PendingRM', 'Scheduled', 'Running', 'QC', 'DispatchReady', 'Closed']);
const ctbStatusEnum = z.enum(['Clear To Build', 'RM Shortage']);

export const ctbDashboardQuerySchema = paginationQuerySchema.extend({
  status: orderStatusEnum.optional(),
  ctbStatus: ctbStatusEnum.optional(),
});

export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
export type CtbDashboardQuery = z.infer<typeof ctbDashboardQuerySchema>;
