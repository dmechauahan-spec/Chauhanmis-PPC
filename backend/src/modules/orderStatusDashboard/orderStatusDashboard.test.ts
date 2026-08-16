import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import orderStatusDashboardRouter from './orderStatusDashboard.routes';

const app = buildTestApp('/api/order-status-dashboard', orderStatusDashboardRouter);

const testModelId = 'TEST-MDL-DASH-001';
const testSku = 'TEST-SKU-DASH-001';
const testProductType = 'OTG Dashboard Test';
const testLineId = 'TEST-LINE-DASH-001';

const orderMainId = 'TEST-SO-DASH-MAIN';
const orderAtRiskId = 'TEST-SO-DASH-ATRISK';
const orderQcPendingId = 'TEST-SO-DASH-QCPENDING';
const orderCompletedId = 'TEST-SO-DASH-COMPLETED';
const orderClosedId = 'TEST-SO-DASH-CLOSED';
const allOrderIds = [orderMainId, orderAtRiskId, orderQcPendingId, orderCompletedId, orderClosedId];

const mainLogIds = ['TEST-DL-DASH-MAIN-01', 'TEST-DL-DASH-MAIN-02'];
const qcPendingLogId = 'TEST-DL-DASH-QCPENDING-01';

// The dashboard composes Part 4A's forecast, which anchors on the REAL
// current date (new Date() inside the service) — fixtures are dated
// relative to actual today, same approach as productionPlan.test.ts and
// orders.test.ts's closure-summary fixtures.
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const REAL_TODAY = utcMidnight(new Date());
function daysFromToday(n: number): Date {
  return new Date(REAL_TODAY.getTime() + n * 86_400_000);
}

let readHeader: { Authorization: string };

beforeAll(async () => {
  readHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'Dashboard Test Line', maxWorkers: 20, efficiencyPct: 90 },
  });
  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Dashboard Test Model',
      productType: testProductType,
      sku: testSku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
    },
  });

  // --- orderMainId: the full "every field pulls from the right source" scenario ---
  await prisma.order.create({
    data: { orderId: orderMainId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 500, dueDate: daysFromToday(30) },
  });
  await prisma.productionSchedule.create({
    data: {
      orderId: orderMainId,
      client: 'Dashboard Test Client',
      sku: testSku,
      product: testProductType,
      qty: 500,
      lineId: testLineId,
      lineName: 'Dashboard Test Line',
      dailyOutput: 100,
      startDate: daysFromToday(-4),
      estEndDate: daysFromToday(0),
      dueDate: daysFromToday(30),
      status: 'OnTrack',
    },
  });
  // 5 plan days (today-4..today), 100/day -> cumulative-to-date = 500.
  for (let i = -4; i <= 0; i++) {
    await prisma.dailyProductionPlan.create({
      data: { orderId: orderMainId, planDate: daysFromToday(i), lineId: testLineId, plannedQty: 100 },
    });
  }
  await prisma.dailyProductionLog.create({
    data: { logId: mainLogIds[0], logDate: daysFromToday(-3), orderId: orderMainId, totalOutputQty: 200, savedBy: 'fixture' },
  });
  await prisma.dailyProductionLog.create({
    data: { logId: mainLogIds[1], logDate: daysFromToday(-1), orderId: orderMainId, totalOutputQty: 150, savedBy: 'fixture' },
  });
  await prisma.dailyQcInspection.create({
    data: {
      orderId: orderMainId,
      inspectionDate: daysFromToday(-3),
      producedQty: 200,
      passedQty: 180,
      rejectedQty: 15,
      reworkQty: 5,
      qcStatus: 'PartialPass',
      inspectorName: 'fixture',
    },
  });
  await prisma.dailyQcInspection.create({
    data: {
      orderId: orderMainId,
      inspectionDate: daysFromToday(-1),
      producedQty: 150,
      passedQty: 140,
      rejectedQty: 10,
      reworkQty: 0,
      qcStatus: 'PartialPass',
      inspectorName: 'fixture',
    },
  });

  // --- orderAtRiskId: schedule.status = AtRisk, no QC data at all -> badge At Risk ---
  await prisma.order.create({
    data: { orderId: orderAtRiskId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 100, dueDate: daysFromToday(30), status: 'Running' },
  });
  await prisma.productionSchedule.create({
    data: {
      orderId: orderAtRiskId,
      client: 'Dashboard Test Client',
      sku: testSku,
      product: testProductType,
      qty: 100,
      lineId: testLineId,
      lineName: 'Dashboard Test Line',
      dailyOutput: 50,
      startDate: daysFromToday(-2),
      estEndDate: daysFromToday(0),
      dueDate: daysFromToday(1),
      status: 'AtRisk',
    },
  });

  // --- orderQcPendingId: production logged, zero QC recorded -> badge QC Pending ---
  await prisma.order.create({
    data: { orderId: orderQcPendingId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 100, dueDate: daysFromToday(30), status: 'Running' },
  });
  await prisma.dailyProductionLog.create({
    data: { logId: qcPendingLogId, logDate: daysFromToday(-1), orderId: orderQcPendingId, totalOutputQty: 50, savedBy: 'fixture' },
  });

  // --- orderCompletedId: status DispatchReady -> badge Completed (overrides everything else) ---
  await prisma.order.create({
    data: { orderId: orderCompletedId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 100, dueDate: daysFromToday(30), status: 'DispatchReady' },
  });

  // --- orderClosedId: must be excluded from the dashboard entirely ---
  await prisma.order.create({
    data: { orderId: orderClosedId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 100, dueDate: daysFromToday(30), status: 'Closed' },
  });
});

afterAll(async () => {
  await prisma.dailyQcInspection.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.dailyProductionLog.deleteMany({ where: { logId: { in: [...mainLogIds, qcPendingLogId] } } });
  await prisma.dailyProductionPlan.deleteMany({ where: { orderId: orderMainId } });
  await prisma.productionSchedule.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('GET /api/order-status-dashboard', () => {
  it('excludes Closed orders entirely', async () => {
    const res = await request(app).get('/api/order-status-dashboard').set(readHeader).query({ pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((r: { orderId: string }) => r.orderId === orderClosedId)).toBe(false);
  });

  it('composes every field of the full lifecycle order from the right source, none recomputed incorrectly', async () => {
    const res = await request(app).get('/api/order-status-dashboard').set(readHeader).query({ pageSize: 100 });
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((r: { orderId: string }) => r.orderId === orderMainId);
    expect(row).toBeDefined();

    // Order context (Module 2).
    expect(row.client).toBe('Dashboard Test Client');
    expect(row.sku).toBe(testSku);
    expect(row.product).toBe(testProductType);
    expect(row.qty).toBe(500);
    expect(row.status).toBe('Open');

    // line (Module 10's schedule).
    expect(row.line).toEqual({ lineId: testLineId, lineName: 'Dashboard Test Line' });

    // machines — always [] (see README: daily_production_log has no machineId column).
    expect(row.machines).toEqual([]);

    // plan — cumulative planned qty TO DATE (5 days x 100, all <= today).
    expect(row.plan).toBe(500);

    // actual — sum of daily_production_log.totalOutputQty (200 + 150).
    expect(row.actual).toBe(350);

    // qc — Part 3's cumulative summary (180+140 passed, 15+10 rejected, 5+0 rework).
    expect(row.qc).toEqual({ passedQty: 320, rejectedQty: 25, reworkQty: 5 });

    // balanceQty — taken directly from Part 4A's forecast.balanceQty (500 - 320).
    expect(row.balanceQty).toBe(180);

    // expectedCompletionDate — present (a real forecast could be computed: recent QC exists).
    expect(row.expectedCompletionDate).not.toBeNull();

    // statusBadge — On Track: schedule OnTrack, not delayed (dueDate is 30 days out),
    // production and QC both recorded (not QC Pending).
    expect(row.statusBadge).toBe('🟢 On Track');
  });

  it('badges an order with schedule.status AtRisk (and no QC data) as At Risk', async () => {
    const res = await request(app).get('/api/order-status-dashboard').set(readHeader).query({ pageSize: 100 });
    const row = res.body.data.items.find((r: { orderId: string }) => r.orderId === orderAtRiskId);
    expect(row).toBeDefined();
    expect(row.statusBadge).toBe('🟡 At Risk');
    expect(row.plan).toBeNull(); // no plan ever generated for this order
  });

  it('badges an order with production logged but zero QC inspections as QC Pending', async () => {
    const res = await request(app).get('/api/order-status-dashboard').set(readHeader).query({ pageSize: 100 });
    const row = res.body.data.items.find((r: { orderId: string }) => r.orderId === orderQcPendingId);
    expect(row).toBeDefined();
    expect(row.actual).toBe(50);
    expect(row.qc).toEqual({ passedQty: 0, rejectedQty: 0, reworkQty: 0 });
    expect(row.statusBadge).toBe('🔵 QC Pending');
    expect(row.line).toBeNull(); // never scheduled
  });

  it('badges a DispatchReady order as Completed', async () => {
    const res = await request(app).get('/api/order-status-dashboard').set(readHeader).query({ pageSize: 100 });
    const row = res.body.data.items.find((r: { orderId: string }) => r.orderId === orderCompletedId);
    expect(row).toBeDefined();
    expect(row.status).toBe('DispatchReady');
    expect(row.statusBadge).toBe('✅ Completed');
  });

  it('paginates with the standard envelope', async () => {
    const res = await request(app).get('/api/order-status-dashboard').set(readHeader).query({ page: 1, pageSize: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(1);
    expect(res.body.data.total).toBeGreaterThanOrEqual(4);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/order-status-dashboard');
    expect(res.status).toBe(401);
  });
});
