import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

// JS-safe identifiers for the Postgres schedule_status enum (spaces mapped
// via @map in schema.prisma), matching the convention Module 2's orderStatus
// enum already established (e.g. 'PendingRM' for 'Pending RM').
const scheduleStatusEnum = z.enum(['OnTrack', 'AtRisk']);

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

export const runSchedulingSchema = z.object({
  dryRun: z.boolean().default(false),
});

export const listScheduleQuerySchema = paginationQuerySchema.extend({
  lineId: z.string().optional(),
  status: scheduleStatusEnum.optional(),
  startDateFrom: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'startDateFrom must be a valid date' }).optional(),
  startDateTo: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'startDateTo must be a valid date' }).optional(),
  estEndDateFrom: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'estEndDateFrom must be a valid date' }).optional(),
  estEndDateTo: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'estEndDateTo must be a valid date' }).optional(),
});

export const unscheduleOrderSchema = z.object({
  reason: z.string().min(1).optional(),
});

export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
export type RunSchedulingInput = z.infer<typeof runSchedulingSchema>;
export type ListScheduleQuery = z.infer<typeof listScheduleQuerySchema>;
export type UnscheduleOrderInput = z.infer<typeof unscheduleOrderSchema>;
