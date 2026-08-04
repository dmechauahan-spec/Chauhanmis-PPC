import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { PERMISSIONS } from '../../config/permissions';
import * as controller from './bomExplosion.controller';
import { orderBomParamsSchema, skuExplosionParamsSchema, skuExplosionQuerySchema } from './bomExplosion.schema';

const router = Router();

router.use(authenticate);
const read = authorize(...PERMISSIONS.bomExplosion.read);
const write = authorize(...PERMISSIONS.bomExplosion.write);

router.get(
  '/sku/:sku',
  read,
  validateRequest({ params: skuExplosionParamsSchema, query: skuExplosionQuerySchema }),
  controller.explodeSku,
);

// GET, despite lazily computing-and-caching a snapshot on first call, is
// still a read from the caller's perspective — treated as `read`, same as
// the ad-hoc explosion above.
router.get(
  '/order/:orderId',
  read,
  validateRequest({ params: orderBomParamsSchema }),
  controller.getOrderSnapshot,
);
router.post(
  '/order/:orderId/recompute',
  write,
  validateRequest({ params: orderBomParamsSchema }),
  controller.recomputeOrderSnapshot,
);
router.delete(
  '/order/:orderId',
  write,
  validateRequest({ params: orderBomParamsSchema }),
  controller.deleteOrderSnapshot,
);

export default router;
