import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import dashboardRouter from './dashboard.routes';
import oeeRouter from '../oee/oee.routes';

const app = buildTestApp('/api/dashboard', dashboardRouter);
const oeeApp = buildTestApp('/api/oee', oeeRouter);

let readHeader: { Authorization: string };

const testModelId = 'TEST-MDL-DASH-001';
const testSku = 'TEST-SKU-DASH-001';
const testProductType = 'OTG Dashboard Test';
const testLineId = 'TEST-LINE-DASH-001'; // efficiencyPct 90
const testLine2Id = 'TEST-LINE-DASH-002'; // efficiencyPct 60
const logId1 = 'TEST-DL-DASH-001';
const logId2 = 'TEST-DL-DASH-002';

const dateFrom = '2026-03-01';
const dateTo = '2026-03-10';
const day1 = new Date('2026-03-02T00:00:00.000Z');
const day2 = new Date('2026-03-05T00:00:00.000Z');

// Delivery-performance fixtures
const orderOnTimeId = 'TEST-SO-DASH-ONTIME';
const orderLateId = 'TEST-SO-DASH-LATE';
const orderNoDueId = 'TEST-SO-DASH-NODUE';

// Delayed-vs-At-Risk fixtures (see the dedicated describe block below)
const orderDelayedOnlyId = 'TEST-SO-DASH-DELAYED';
const orderAtRiskOnlyId = 'TEST-SO-DASH-ATRISK';

const allOrderIds = [orderOnTimeId, orderLateId, orderNoDueId, orderDelayedOnlyId, orderAtRiskOnlyId];

beforeAll(async () => {
  readHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Dashboard Test Model',
      productType: testProductType,
      sku: testSku,
      taktTimeSec: 60,
      manpowerRequired: 1,
      noOfStations: 2,
    },
  });

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'Dashboard Test Line 1', maxWorkers: 5, efficiencyPct: 90, status: 'Active' },
  });
  await prisma.productionLine.create({
    data: { lineId: testLine2Id, lineName: 'Dashboard Test Line 2', maxWorkers: 5, efficiencyPct: 60, status: 'Active' },
  });

  // 480 planned minutes, no downtime -> runTimeMinutes 480; takt 60s ->
  // standardOutput 480. Line 1: 400/480 output. Line 2: 200/480 output.
  await prisma.dailyProductionLog.create({
    data: {
      logId: logId1,
      logDate: day1,
      lineId: testLineId,
      modelId: testModelId,
      plannedMinutes: 480,
      totalOutputQty: 400,
      goodQty: 380,
      totalEmployees: 10,
      presentEmployees: 9,
      attendancePct: 90,
    },
  });
  await prisma.dailyProductionLog.create({
    data: {
      logId: logId2,
      logDate: day2,
      lineId: testLine2Id,
      modelId: testModelId,
      plannedMinutes: 480,
      totalOutputQty: 200,
      goodQty: 190,
      totalEmployees: 10,
      presentEmployees: 8,
      attendancePct: 80,
    },
  });

  // Delivery-performance fixtures: DispatchReady transitions inside the range.
  await prisma.order.create({
    data: { orderId: orderOnTimeId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 10, dueDate: new Date('2026-03-20'), status: 'DispatchReady' },
  });
  await prisma.order.create({
    data: { orderId: orderLateId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 10, dueDate: new Date('2026-03-01'), status: 'DispatchReady' },
  });
  await prisma.order.create({
    data: { orderId: orderNoDueId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 10, status: 'DispatchReady' },
  });
  await prisma.orderStatusHistory.create({
    data: { orderId: orderOnTimeId, oldStatus: 'QC', newStatus: 'DispatchReady', changedAt: day2 },
  });
  await prisma.orderStatusHistory.create({
    data: { orderId: orderLateId, oldStatus: 'QC', newStatus: 'DispatchReady', changedAt: day2 },
  });
  await prisma.orderStatusHistory.create({
    data: { orderId: orderNoDueId, oldStatus: 'QC', newStatus: 'DispatchReady', changedAt: day2 },
  });

  // Delayed: dueDate safely in the past (real wall-clock, not the fixture
  // date range above), status not yet Dispatch Ready/Closed, NO schedule row.
  await prisma.order.create({
    data: { orderId: orderDelayedOnlyId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 10, dueDate: new Date('2020-01-01'), status: 'Running' },
  });
  // At Risk: a production_schedule row with status AtRisk, dueDate safely in
  // the FUTURE so it does NOT also count as delayed.
  await prisma.order.create({
    data: { orderId: orderAtRiskOnlyId, client: 'Dashboard Test Client', sku: testSku, product: testProductType, qty: 10, dueDate: new Date('2030-01-01'), status: 'Scheduled' },
  });
  await prisma.productionSchedule.create({
    data: {
      orderId: orderAtRiskOnlyId,
      client: 'Dashboard Test Client',
      sku: testSku,
      product: testProductType,
      qty: 10,
      lineId: testLineId,
      lineName: 'Dashboard Test Line 1',
      startDate: new Date('2026-01-01'),
      estEndDate: new Date('2026-01-05'),
      dueDate: new Date('2030-01-01'),
      slackDays: -1000,
      status: 'AtRisk',
    },
  });
});

afterAll(async () => {
  await prisma.productionSchedule.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.dailyProductionLog.deleteMany({ where: { logId: { in: [logId1, logId2] } } });
  await prisma.productionLine.deleteMany({ where: { lineId: { in: [testLineId, testLine2Id] } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('GET /api/dashboard/production', () => {
  it('groups output by period within the date range', async () => {
    const res = await request(app).get('/api/dashboard/production').set(readHeader).query({ period: 'daily', dateFrom, dateTo });
    expect(res.status).toBe(200);
    const totalOutput = res.body.data.reduce((sum: number, row: { totalOutputQty: number }) => sum + row.totalOutputQty, 0);
    expect(totalOutput).toBeGreaterThanOrEqual(600); // at least our 400 + 200 fixture logs
  });

  it('rejects a missing dateFrom/dateTo', async () => {
    const res = await request(app).get('/api/dashboard/production').set(readHeader).query({ period: 'daily' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid period', async () => {
    const res = await request(app).get('/api/dashboard/production').set(readHeader).query({ period: 'yearly', dateFrom, dateTo });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/dashboard/planning', () => {
  it('reflects both the delayed-only and at-risk-only fixture orders', async () => {
    const res = await request(app).get('/api/dashboard/planning').set(readHeader);
    expect(res.status).toBe(200);
    // orderDelayedOnlyId (overdue dueDate, no schedule row) and
    // orderAtRiskOnlyId (production_schedule.status AtRisk, future dueDate)
    // each satisfy exactly one of these two counts — the next test proves
    // they're computed from genuinely different queries.
    expect(res.body.data.delayedCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.atRiskCount).toBeGreaterThanOrEqual(1);
  });

  it('confirms the delayed order does not also count as at-risk and vice versa', async () => {
    // Remove the at-risk order's schedule row temporarily and re-check
    // delayedCount is unaffected, proving delayedCount never reads
    // production_schedule.status at all.
    const beforeRemoval = await request(app).get('/api/dashboard/planning').set(readHeader);

    await prisma.productionSchedule.delete({ where: { orderId: orderAtRiskOnlyId } });
    const afterRemoval = await request(app).get('/api/dashboard/planning').set(readHeader);

    expect(afterRemoval.body.data.atRiskCount).toBe(beforeRemoval.body.data.atRiskCount - 1);
    expect(afterRemoval.body.data.delayedCount).toBe(beforeRemoval.body.data.delayedCount); // unaffected

    // Restore for any later test/run.
    await prisma.productionSchedule.create({
      data: {
        orderId: orderAtRiskOnlyId,
        client: 'Dashboard Test Client',
        sku: testSku,
        product: testProductType,
        qty: 10,
        lineId: testLineId,
        lineName: 'Dashboard Test Line 1',
        startDate: new Date('2026-01-01'),
        estEndDate: new Date('2026-01-05'),
        dueDate: new Date('2030-01-01'),
        slackDays: -1000,
        status: 'AtRisk',
      },
    });
  });
});

describe('GET /api/dashboard/materials', () => {
  it('returns the ctbBreakdown, rmShortagePartsCount, and procurementStatusBreakdown shape', async () => {
    const res = await request(app).get('/api/dashboard/materials').set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.ctbBreakdown).toHaveProperty('clearCount');
    expect(res.body.data.ctbBreakdown).toHaveProperty('shortageCount');
    expect(res.body.data.ctbBreakdown).toHaveProperty('neverCheckedCount');
    expect(typeof res.body.data.rmShortagePartsCount).toBe('number');
    expect(res.body.data.procurementStatusBreakdown).toHaveProperty('Draft');
  });
});

describe('GET /api/dashboard/management', () => {
  it('matches capacityUtilizationPct to Module 4\'s own performancePct exactly for the same range', async () => {
    const oeeRes = await request(oeeApp).get('/api/oee/summary').set(readHeader).query({ dateFrom, dateTo });
    const dashRes = await request(app).get('/api/dashboard/management').set(readHeader).query({ dateFrom, dateTo });

    expect(oeeRes.status).toBe(200);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.capacityUtilizationPct).toBe(oeeRes.body.data.performancePct);
    expect(dashRes.body.data.oeePct).toBe(oeeRes.body.data.oeePct);
  });

  it('computes the output-weighted productionEfficiencyPct correctly', async () => {
    const res = await request(app).get('/api/dashboard/management').set(readHeader).query({ dateFrom, dateTo });
    expect(res.status).toBe(200);
    // (90*400 + 60*200) / 600 = 80
    expect(res.body.data.productionEfficiencyPct).toBe(80);
  });

  it('computes deliveryPerformancePct from DispatchReady transitions, excluding no-dueDate orders', async () => {
    const res = await request(app).get('/api/dashboard/management').set(readHeader).query({ dateFrom, dateTo });
    expect(res.status).toBe(200);
    expect(res.body.data.detail.deliveryPerformance.onTimeCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.detail.deliveryPerformance.totalCount).toBeGreaterThanOrEqual(2);
    expect(res.body.data.detail.deliveryPerformance.excludedNoDueDateCount).toBeGreaterThanOrEqual(1);
  });

  it('rejects a missing date range', async () => {
    const res = await request(app).get('/api/dashboard/management').set(readHeader);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/dashboard/overview', () => {
  it('composes all four sections in one call', async () => {
    const res = await request(app).get('/api/dashboard/overview').set(readHeader).query({ dateFrom, dateTo });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('production');
    expect(res.body.data).toHaveProperty('planning');
    expect(res.body.data).toHaveProperty('materials');
    expect(res.body.data).toHaveProperty('management');
    expect(res.body.data.management).toHaveProperty('capacityUtilizationPct');
    expect(res.body.data.management).toHaveProperty('deliveryPerformancePct');
  });

  it('rejects a missing date range', async () => {
    const res = await request(app).get('/api/dashboard/overview').set(readHeader);
    expect(res.status).toBe(400);
  });
});
