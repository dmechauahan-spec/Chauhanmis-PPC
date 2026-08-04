import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const teamParamsSchema = z.object({
  teamId: z.string().min(1),
});

export const createHrTeamSchema = z.object({
  teamId: z.string().min(1, 'teamId is required'),
  teamName: z.string().min(1, 'teamName is required'),
  lineId: z.string().min(1).optional(),
  workers: z.coerce.number().int().positive('workers must be > 0'),
  skill: z.string().optional(),
  attendancePct: z.coerce.number().min(0).max(100).optional(),
  shift: z.string().optional(),
  notes: z.string().optional(),
});

export const updateHrTeamSchema = z
  .object({
    teamName: z.string().min(1),
    lineId: z.string().min(1).nullable(),
    workers: z.coerce.number().int().positive('workers must be > 0'),
    skill: z.string().nullable(),
    attendancePct: z.coerce.number().min(0).max(100).nullable(),
    shift: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const listHrTeamsQuerySchema = paginationQuerySchema.extend({
  lineId: z.string().optional(),
});

export type CreateHrTeamInput = z.infer<typeof createHrTeamSchema>;
export type UpdateHrTeamInput = z.infer<typeof updateHrTeamSchema>;
export type ListHrTeamsQuery = z.infer<typeof listHrTeamsQuerySchema>;
