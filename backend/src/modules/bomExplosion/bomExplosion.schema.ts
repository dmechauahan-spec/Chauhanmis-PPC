import { z } from 'zod';

export const skuExplosionParamsSchema = z.object({
  sku: z.string().min(1),
});

export const skuExplosionQuerySchema = z.object({
  qty: z.coerce.number().positive('qty must be > 0'),
});

export const orderBomParamsSchema = z.object({
  orderId: z.string().min(1),
});

export type SkuExplosionParams = z.infer<typeof skuExplosionParamsSchema>;
export type SkuExplosionQuery = z.infer<typeof skuExplosionQuerySchema>;
export type OrderBomParams = z.infer<typeof orderBomParamsSchema>;
