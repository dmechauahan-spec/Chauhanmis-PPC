import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { installBigIntJsonSupport } from './utils/bigint';
import { prisma } from './db/client';
import { withRetry } from './db/withRetry';
import { buildCorsOptions } from './config/cors';
import productsRouter from './modules/products/products.routes';
import linesRouter from './modules/lines/lines.routes';
import machinesRouter from './modules/machines/machines.routes';
import hrRouter from './modules/hr/hr.routes';
import bomRouter from './modules/bom/bom.routes';
import rmInventoryRouter from './modules/rmInventory/rmInventory.routes';
import ordersRouter from './modules/orders/orders.routes';
import dailyLogsRouter from './modules/dailyLogs/dailyLogs.routes';
import oeeRouter from './modules/oee/oee.routes';
import bomExplosionRouter from './modules/bomExplosion/bomExplosion.routes';
import ctbRouter from './modules/ctb/ctb.routes';
import materialsRouter from './modules/materials/materials.routes';
import shortageReportRouter from './modules/shortageReport/shortageReport.routes';
import purchaseRequisitionsRouter from './modules/purchaseRequisitions/purchaseRequisitions.routes';
import schedulingRouter from './modules/scheduling/scheduling.routes';
import productionPlanRouter from './modules/productionPlan/productionPlan.routes';
import riskRouter from './modules/risk/risk.routes';
import searchRouter from './modules/search/search.routes';
import qcRouter from './modules/qc/qc.routes';
import qcInspectionRouter from './modules/qcInspection/qcInspection.routes';
import dashboardRouter from './modules/dashboard/dashboard.routes';
import orderStatusDashboardRouter from './modules/orderStatusDashboard/orderStatusDashboard.routes';
import warehousesRouter from './modules/warehouses/warehouses.routes';
import fgBatchRouter from './modules/fgBatch/fgBatch.routes';
import fgReservationRouter from './modules/fgBatch/fgReservation.routes';
import salesOrdersRouter from './modules/salesOrders/salesOrders.routes';
import authRouter from './modules/auth/auth.routes';

installBigIntJsonSupport();

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors(buildCorsOptions()));
  app.use(express.json());
  app.use(requestLogger);

  // Explicitly wraps the initial-connection case with withRetry: a fresh
  // `SELECT 1` is trivially read-only and idempotent, so unlike the
  // blanket read-operation retry in db/client.ts (which only fires once a
  // query is already attempted), this covers a cold/dropped connection
  // being probed for the first time — e.g. right after a Neon compute
  // resumes from idle.
  app.get('/health', async (_req, res) => {
    try {
      await withRetry(() => prisma.$queryRaw`SELECT 1`);
      res.status(200).json({ success: true, data: { status: 'ok', database: 'reachable' } });
    } catch {
      res.status(503).json({ success: false, error: { message: 'Database unreachable' } });
    }
  });

  app.use('/api/products', productsRouter);
  app.use('/api/lines', linesRouter);
  app.use('/api/machines', machinesRouter);
  app.use('/api/hr-teams', hrRouter);
  app.use('/api/bom', bomRouter);
  app.use('/api/rm-inventory', rmInventoryRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/daily-logs', dailyLogsRouter);
  app.use('/api/oee', oeeRouter);
  app.use('/api/bom-explosion', bomExplosionRouter);
  app.use('/api/ctb', ctbRouter);
  app.use('/api/materials', materialsRouter);
  app.use('/api/shortage-report', shortageReportRouter);
  app.use('/api/purchase-requisitions', purchaseRequisitionsRouter);
  app.use('/api/scheduling', schedulingRouter);
  app.use('/api/production-plan', productionPlanRouter);
  app.use('/api/risk', riskRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/qc', qcRouter);
  app.use('/api/qc-inspections', qcInspectionRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/order-status-dashboard', orderStatusDashboardRouter);
  app.use('/api/warehouses', warehousesRouter);
  app.use('/api/fg-batches', fgBatchRouter);
  app.use('/api/fg-reservations', fgReservationRouter);
  app.use('/api/sales-orders', salesOrdersRouter);
  app.use('/api/auth', authRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
