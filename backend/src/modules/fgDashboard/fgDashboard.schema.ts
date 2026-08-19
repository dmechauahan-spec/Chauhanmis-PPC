import { z } from 'zod';

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

// GET /api/fg-dashboard — dateFrom/dateTo are BOTH optional, unlike Module
// 14's dashboard where a range is mandatory (see dashboard.schema.ts). They
// only scope todaysFgProduction/dispatchedQuantity (see fgDashboard.service.ts)
// — every other figure is a current-state snapshot regardless of what's
// given. Either can be given alone (an open-ended range); if both are given,
// dateFrom must be on or before dateTo.
export const fgDashboardQuerySchema = z
  .object({
    dateFrom: z.string().refine(isValidDateString, { message: 'dateFrom must be a valid date' }).optional(),
    dateTo: z.string().refine(isValidDateString, { message: 'dateTo must be a valid date' }).optional(),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || new Date(data.dateFrom) <= new Date(data.dateTo), {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateFrom'],
  });

// GET /api/fg-batches/:fgBatchNo/trace
export const fgBatchTraceParamsSchema = z.object({
  fgBatchNo: z.string().min(1),
});

export type FgDashboardQuery = z.infer<typeof fgDashboardQuerySchema>;
export type FgBatchTraceParams = z.infer<typeof fgBatchTraceParamsSchema>;
