import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

// date_from/date_to are REQUIRED for every range-based OEE endpoint (#2, #3,
// #4) — unlike the daily-log summary, unbounded OEE queries would mean
// summing every log ever entered, which is expensive and rarely what a
// dashboard wants. See README "Assumptions".
const dateRangeFields = {
  dateFrom: z.string().refine(isValidDateString, { message: 'dateFrom must be a valid date' }),
  dateTo: z.string().refine(isValidDateString, { message: 'dateTo must be a valid date' }),
  lineId: z.string().optional(),
  modelId: z.string().optional(),
  shift: z.string().optional(),
};

function dateOrderRefinement(data: { dateFrom: string; dateTo: string }) {
  return new Date(data.dateFrom) <= new Date(data.dateTo);
}
const dateOrderMessage = { message: 'dateFrom must be on or before dateTo', path: ['dateFrom'] };

export const oeeListQuerySchema = paginationQuerySchema
  .extend(dateRangeFields)
  .refine(dateOrderRefinement, dateOrderMessage);

export const oeeDateRangeQuerySchema = z.object(dateRangeFields).refine(dateOrderRefinement, dateOrderMessage);

export type OeeListQuery = z.infer<typeof oeeListQuerySchema>;
export type OeeDateRangeQuery = z.infer<typeof oeeDateRangeQuerySchema>;
