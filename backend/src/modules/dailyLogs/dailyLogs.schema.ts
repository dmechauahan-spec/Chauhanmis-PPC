import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const DOWNTIME_REASONS = [
  'Material Not Available',
  'Machine Breakdown',
  'Changeover Activity',
  'Operator Unavailable',
  'Power Failure',
  'Other',
] as const;

const downtimeReasonEnum = z.enum(DOWNTIME_REASONS);

const stationAssignmentsSchema = z.record(
  z.string().min(1),
  z.array(z.string().min(1, 'worker name cannot be empty')),
);

export const downtimeEntryInputSchema = z
  .object({
    reason: downtimeReasonEnum,
    minutes: z.coerce.number().positive('minutes must be > 0'),
    notes: z.string().min(1).optional(),
  })
  .refine((data) => data.reason !== 'Other' || !!data.notes, {
    message: "notes is required when reason is 'Other'",
    path: ['notes'],
  });

export const logIdParamsSchema = z.object({
  logId: z.string().min(1),
});

export const downtimeIdParamsSchema = z.object({
  logId: z.string().min(1),
  downtimeId: z
    .string()
    .regex(/^\d+$/, 'downtimeId must be a positive integer')
    .transform((val) => BigInt(val)),
});

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

export const createDailyLogSchema = z
  .object({
    logDate: z.string().refine(isValidDateString, { message: 'logDate must be a valid date' }),
    shift: z.string().optional(),
    lineId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    activeLinesCount: z.coerce.number().int().positive().optional(),
    totalEmployees: z.coerce.number().int().nonnegative().optional(),
    presentEmployees: z.coerce.number().int().nonnegative().optional(),
    taktTimeOverride: z.coerce.number().positive().optional(),
    manpowerOverride: z.coerce.number().int().positive().optional(),
    notes: z.string().optional(),
    stationAssignments: stationAssignmentsSchema.optional(),
    downtimeEntries: z.array(downtimeEntryInputSchema).optional(),
    // Module 4 (OEE) fields — see README "Schema gap".
    plannedMinutes: z.coerce.number().nonnegative().optional(),
    totalOutputQty: z.coerce.number().nonnegative().optional(),
    goodQty: z.coerce.number().nonnegative().optional(),
  })
  .refine(
    (data) =>
      data.totalEmployees === undefined ||
      data.presentEmployees === undefined ||
      data.presentEmployees <= data.totalEmployees,
    { message: 'presentEmployees cannot exceed totalEmployees', path: ['presentEmployees'] },
  )
  .refine(
    (data) =>
      data.goodQty === undefined || data.totalOutputQty === undefined || data.goodQty <= data.totalOutputQty,
    { message: 'goodQty cannot exceed totalOutputQty', path: ['goodQty'] },
  );

export const updateDailyLogSchema = z
  .object({
    shift: z.string().nullable(),
    lineId: z.string().min(1).nullable(),
    modelId: z.string().min(1).nullable(),
    activeLinesCount: z.coerce.number().int().positive().nullable(),
    totalEmployees: z.coerce.number().int().nonnegative().nullable(),
    presentEmployees: z.coerce.number().int().nonnegative().nullable(),
    taktTimeOverride: z.coerce.number().positive().nullable(),
    manpowerOverride: z.coerce.number().int().positive().nullable(),
    notes: z.string().nullable(),
    stationAssignments: stationAssignmentsSchema.nullable(),
    // Module 4 (OEE) fields — see README "Schema gap".
    plannedMinutes: z.coerce.number().nonnegative().nullable(),
    totalOutputQty: z.coerce.number().nonnegative().nullable(),
    goodQty: z.coerce.number().nonnegative().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const listDailyLogsQuerySchema = paginationQuerySchema.extend({
  dateFrom: z.string().refine(isValidDateString, { message: 'dateFrom must be a valid date' }).optional(),
  dateTo: z.string().refine(isValidDateString, { message: 'dateTo must be a valid date' }).optional(),
  lineId: z.string().optional(),
  modelId: z.string().optional(),
  shift: z.string().optional(),
});

export const downtimeSummaryQuerySchema = z.object({
  dateFrom: z.string().refine(isValidDateString, { message: 'dateFrom must be a valid date' }).optional(),
  dateTo: z.string().refine(isValidDateString, { message: 'dateTo must be a valid date' }).optional(),
  lineId: z.string().optional(),
});

export type CreateDailyLogInput = z.infer<typeof createDailyLogSchema>;
export type UpdateDailyLogInput = z.infer<typeof updateDailyLogSchema>;
export type ListDailyLogsQuery = z.infer<typeof listDailyLogsQuerySchema>;
export type DowntimeEntryInput = z.infer<typeof downtimeEntryInputSchema>;
export type DowntimeSummaryQuery = z.infer<typeof downtimeSummaryQuerySchema>;
