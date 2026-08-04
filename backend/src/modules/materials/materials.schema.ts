import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const partIdParamsSchema = z.object({
  partId: z.string().min(1),
});

const priorityEnum = z.enum(['Low', 'Medium', 'High']);

export const materialsShortageQuerySchema = paginationQuerySchema.extend({
  // "Only include parts affecting at least one order of this priority or
  // higher" — a threshold on the part's highestPriority, not a per-row
  // filter, so a qualifying part still shows every affected order (even
  // lower-priority ones). See materials.service.ts.
  priority: priorityEnum.optional(),
  partId: z.string().optional(),
});

// Deliberately NOT z.coerce.number() — coercing `null` would silently turn
// "clear the threshold" into `Number(null) === 0`. This field must arrive
// as a real JSON number or a real JSON null.
export const setCriticalThresholdSchema = z.object({
  criticalThreshold: z.number().nonnegative('criticalThreshold must be >= 0').nullable(),
});

export type PartIdParams = z.infer<typeof partIdParamsSchema>;
export type MaterialsShortageQuery = z.infer<typeof materialsShortageQuerySchema>;
export type SetCriticalThresholdInput = z.infer<typeof setCriticalThresholdSchema>;
