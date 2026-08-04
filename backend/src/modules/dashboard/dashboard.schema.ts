import { z } from 'zod';

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

const dateRangeFields = {
  dateFrom: z.string().refine(isValidDateString, { message: 'dateFrom must be a valid date' }),
  dateTo: z.string().refine(isValidDateString, { message: 'dateTo must be a valid date' }),
};

function dateOrderRefinement(data: { dateFrom: string; dateTo: string }) {
  return new Date(data.dateFrom) <= new Date(data.dateTo);
}
const dateOrderMessage = { message: 'dateFrom must be on or before dateTo', path: ['dateFrom'] };

export const productionQuerySchema = z
  .object({
    period: z.enum(['daily', 'weekly', 'monthly']),
    ...dateRangeFields,
  })
  .refine(dateOrderRefinement, dateOrderMessage);

export const managementQuerySchema = z.object(dateRangeFields).refine(dateOrderRefinement, dateOrderMessage);

export const overviewQuerySchema = z.object(dateRangeFields).refine(dateOrderRefinement, dateOrderMessage);

export type ProductionQuery = z.infer<typeof productionQuerySchema>;
export type ManagementQuery = z.infer<typeof managementQuerySchema>;
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
