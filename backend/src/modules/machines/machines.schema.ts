import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

const machineStatusEnum = z.enum(['Active', 'Offline', 'Maintenance']);

export const machineParamsSchema = z.object({
  machineId: z.string().min(1),
});

// At least one capacity field must be present — Zod-layer validation only
// (not a DB constraint), per README "Machine master data". If more than one
// is given, none are reconciled against each other; all are stored as-is.
function hasAtLeastOneCapacity(data: {
  capacityPerHour?: number;
  capacityPerShift?: number;
  capacityPerDay?: number;
}): boolean {
  return data.capacityPerHour !== undefined || data.capacityPerShift !== undefined || data.capacityPerDay !== undefined;
}

export const createMachineSchema = z
  .object({
    machineId: z.string().min(1, 'machineId is required'),
    machineName: z.string().min(1, 'machineName is required'),
    lineId: z.string().min(1, 'lineId is required'),
    capacityPerHour: z.coerce.number().positive().optional(),
    capacityPerShift: z.coerce.number().positive().optional(),
    capacityPerDay: z.coerce.number().positive().optional(),
    status: machineStatusEnum.default('Active'),
    notes: z.string().optional(),
  })
  .refine(hasAtLeastOneCapacity, {
    message: 'At least one of capacityPerHour, capacityPerShift, capacityPerDay must be provided',
    path: ['capacityPerHour'],
  });

export const updateMachineSchema = z
  .object({
    machineName: z.string().min(1),
    lineId: z.string().min(1),
    capacityPerHour: z.coerce.number().positive().nullable(),
    capacityPerShift: z.coerce.number().positive().nullable(),
    capacityPerDay: z.coerce.number().positive().nullable(),
    status: machineStatusEnum,
    notes: z.string().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' })
  .refine(
    (data) => {
      // Only a problem if this single request would explicitly null out all
      // three capacity fields at once — a payload that doesn't touch a given
      // capacity field, or touches only some of them, is fine (see README:
      // this is a payload-local Zod check, not a DB-merge-aware one).
      const touchesAll = 'capacityPerHour' in data && 'capacityPerShift' in data && 'capacityPerDay' in data;
      if (!touchesAll) return true;
      return data.capacityPerHour != null || data.capacityPerShift != null || data.capacityPerDay != null;
    },
    {
      message: 'At least one of capacityPerHour, capacityPerShift, capacityPerDay must remain set',
      path: ['capacityPerHour'],
    },
  );

export const listMachinesQuerySchema = paginationQuerySchema.extend({
  status: machineStatusEnum.optional(),
  lineId: z.string().optional(),
});

export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
export type ListMachinesQuery = z.infer<typeof listMachinesQuerySchema>;
