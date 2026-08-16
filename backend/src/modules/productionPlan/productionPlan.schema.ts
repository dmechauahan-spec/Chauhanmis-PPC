import { z } from 'zod';

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
