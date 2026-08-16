import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import productionPlanRouter from './productionPlan.routes';

const app = buildTestApp('/api/production-plan', productionPlanRouter);

const testModelId = 'TEST-MDL-PPLAN-001';
const testSku = 'TEST-SKU-PPLAN-001';
const testProductType = 'OTG PPlan Test';
const testLineId = 'TEST-LINE-PPLAN-001';

const scheduledOrderId = 'TEST-SO-PPLAN-SCHED';
const noScheduleOrderId = 'TEST-SO-PPLAN-NOSCHED';
const noPlanYetOrderId = 'TEST-SO-PPLAN-NOPLAN';
const forecastOnTrackOrderId = 'TEST-SO-PPLAN-FORECAST-OK';
const forecastNoDataOrderId = 'TEST-SO-PPLAN-FORECAST-NODATA';

const DAY0 = new Date('2031-04-01T00:00:00.000Z');
function daysAfter(days: number): Date {
  return new Date(DAY0.getTime() + days * 86_400_000);
}

// The completion-forecast endpoint anchors its "recent window" on the REAL
// current date (new Date() inside the service), not a fixed test date — so
// its fixtures must be dated relative to actual today, unlike every other
// fixture in this file (which uses the fixed, far-future DAY0).
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const REAL_TODAY = utcMidnight(new Date());
function daysFromToday(n: number): Date {
  return new Date(REAL_TODAY.getTime() + n * 86_400_000);
}

const dailyLogIds = ['TEST-DL-PPLAN-01', 'TEST-DL-PPLAN-02', 'TEST-DL-PPLAN-03'];

let writeHeader: { Authorization: string }; // ProductionManager
let readOnlyHeader: { Authorization: string }; // StoreManager

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.ProductionManager);
  readOnlyHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'PPlan Test Line', maxWorkers: 20, efficiencyPct: 90 },
  });
  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'PPlan Test Model',
      productType: testProductType,
      sku: testSku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
    },
  });

  for (const orderId of [scheduledOrderId, noScheduleOrderId, noPlanYetOrderId]) {
    await prisma.order.create({
      data: { orderId, client: 'PPlan Test Client', sku: testSku, product: testProductType, qty: 250 },
    });
  }

  // 3-day schedule: dailyOutput=100, qty=250 -> expect plannedQty [100, 100, 50].
  await prisma.productionSchedule.create({
    data: {
      orderId: scheduledOrderId,
      client: 'PPlan Test Client',
      sku: testSku,
      product: testProductType,
      qty: 250,
      lineId: testLineId,
      lineName: 'PPlan Test Line',
      dailyOutput: 100,
      workersPresent: 5,
      workersRequired: 5,
      daysNeeded: 2.5,
      startDate: DAY0,
      estEndDate: daysAfter(2),
      dueDate: daysAfter(2),
      slackDays: 0,
      status: 'OnTrack',
    },
  });
  // noPlanYetOrderId also gets a schedule (so it's eligible), but generate is
  // deliberately never called for it — used to test the "not computed yet" 404.
  await prisma.productionSchedule.create({
    data: {
      orderId: noPlanYetOrderId,
      client: 'PPlan Test Client',
      sku: testSku,
      product: testProductType,
      qty: 250,
      lineId: testLineId,
      lineName: 'PPlan Test Line',
      dailyOutput: 100,
      workersPresent: 5,
      workersRequired: 5,
      daysNeeded: 2.5,
      startDate: DAY0,
      estEndDate: daysAfter(2),
      dueDate: daysAfter(2),
      slackDays: 0,
      status: 'OnTrack',
    },
  });

  // Forecast fixtures — dated relative to REAL_TODAY (see comment above).
  await prisma.order.create({
    data: {
      orderId: forecastOnTrackOrderId,
      client: 'PPlan Test Client',
      sku: testSku,
      product: testProductType,
      qty: 1000,
      dueDate: daysFromToday(30), // comfortably in the future
    },
  });
  await prisma.order.create({
    data: { orderId: forecastNoDataOrderId, client: 'PPlan Test Client', sku: testSku, product: testProductType, qty: 500 },
  });
  // 7 days of QC inspections (today and the 6 days before), 100 passed/day —
  // exactly COMPLETION_FORECAST_WINDOW_DAYS. acceptedProductionQty (all-time
  // passed) = 700 -> balanceQty = 300 -> remainingProductionDays = 3.
  for (let i = 0; i < 7; i++) {
    await prisma.dailyQcInspection.create({
      data: {
        id: BigInt(9_000_000 + i), // fixed, collision-free ids for easy cleanup
        orderId: forecastOnTrackOrderId,
        inspectionDate: daysFromToday(-i),
        producedQty: 100,
        passedQty: 100,
        rejectedQty: 0,
        reworkQty: 0,
        qcStatus: 'Passed',
        inspectorName: 'fixture',
      },
    });
  }
});

afterAll(async () => {
  await prisma.downtimeLog.deleteMany({ where: { logId: { in: dailyLogIds } } });
  await prisma.dailyProductionLog.deleteMany({ where: { logId: { in: dailyLogIds } } });
  await prisma.dailyQcInspection.deleteMany({
    where: { orderId: { in: [forecastOnTrackOrderId, forecastNoDataOrderId] } },
  });
  await prisma.dailyProductionPlan.deleteMany({
    where: { orderId: { in: [scheduledOrderId, noScheduleOrderId, noPlanYetOrderId] } },
  });
  await prisma.productionSchedule.deleteMany({
    where: { orderId: { in: [scheduledOrderId, noScheduleOrderId, noPlanYetOrderId] } },
  });
  await prisma.order.deleteMany({
    where: {
      orderId: { in: [scheduledOrderId, noScheduleOrderId, noPlanYetOrderId, forecastOnTrackOrderId, forecastNoDataOrderId] },
    },
  });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('POST /api/production-plan/generate/:orderId', () => {
  it('fails clearly when the order has no schedule yet', async () => {
    const res = await request(app).post(`/api/production-plan/generate/${noScheduleOrderId}`).set(writeHeader);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/no production schedule/i);
  });

  it('generates a day-by-day plan matching the schedule span, summing exactly to order qty', async () => {
    const res = await request(app).post(`/api/production-plan/generate/${scheduledOrderId}`).set(writeHeader);
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);

    const plannedQtys = res.body.data.map((r: { plannedQty: number }) => Number(r.plannedQty));
    expect(plannedQtys).toEqual([100, 100, 50]);
    expect(plannedQtys.reduce((a: number, b: number) => a + b, 0)).toBe(250);

    // machineId stays null — machine-level scheduling assignment isn't built yet.
    expect(res.body.data.every((r: { machineId: string | null }) => r.machineId === null)).toBe(true);
    expect(res.body.data.every((r: { lineId: string | null }) => r.lineId === testLineId)).toBe(true);
  });

  it('replaces (not duplicates) the plan on re-generation', async () => {
    const res = await request(app).post(`/api/production-plan/generate/${scheduledOrderId}`).set(writeHeader);
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);

    const rows = await prisma.dailyProductionPlan.findMany({ where: { orderId: scheduledOrderId } });
    expect(rows).toHaveLength(3);
  });

  it('rejects a StoreManager (not Admin/ProductionManager) with 403', async () => {
    const res = await request(app).post(`/api/production-plan/generate/${scheduledOrderId}`).set(readOnlyHeader);
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).post('/api/production-plan/generate/DOES-NOT-EXIST').set(writeHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/production-plan/:orderId', () => {
  it('returns the day-by-day plan, readable by StoreManager', async () => {
    const res = await request(app).get(`/api/production-plan/${scheduledOrderId}`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].planDate.slice(0, 10)).toBe('2031-04-01');
  });

  it('returns 404 pointing at the generate endpoint when no plan exists yet', async () => {
    const res = await request(app).get(`/api/production-plan/${noPlanYetOrderId}`).set(readOnlyHeader);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/generate/i);
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).get('/api/production-plan/DOES-NOT-EXIST').set(readOnlyHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/production-plan/:orderId/plan-vs-actual', () => {
  beforeAll(async () => {
    // Day 1 (planned 100): one log, under-achieved, with a downtime reason.
    await prisma.dailyProductionLog.create({
      data: {
        logId: dailyLogIds[0],
        logDate: daysAfter(0),
        orderId: scheduledOrderId,
        totalOutputQty: 80,
        savedBy: 'fixture',
      },
    });
    await prisma.downtimeLog.create({
      data: { logId: dailyLogIds[0], reason: 'Machine Breakdown', minutes: 30 },
    });

    // Day 2 (planned 100): two shift entries summing to 110 (over-achieved).
    await prisma.dailyProductionLog.create({
      data: {
        logId: dailyLogIds[1],
        logDate: daysAfter(1),
        orderId: scheduledOrderId,
        shift: 'General',
        totalOutputQty: 60,
        savedBy: 'fixture',
      },
    });
    await prisma.dailyProductionLog.create({
      data: {
        logId: dailyLogIds[2],
        logDate: daysAfter(1),
        orderId: scheduledOrderId,
        shift: 'Full+Extended',
        totalOutputQty: 50,
        savedBy: 'fixture',
      },
    });

    // Day 3 (planned 50): no daily log at all.
  });

  it('joins plan against actual logs by orderId+date, sums same-day entries, and flags noDataLogged', async () => {
    const res = await request(app)
      .get(`/api/production-plan/${scheduledOrderId}/plan-vs-actual`)
      .set(readOnlyHeader);
    expect(res.status).toBe(200);

    const days = res.body.data.days;
    expect(days).toHaveLength(3);

    // Day 1: under-achieved, one downtime reason pulled through.
    expect(days[0]).toMatchObject({
      plannedQty: 100,
      actualQty: 80,
      gap: -20,
      achievementPct: 80,
      noDataLogged: false,
    });
    expect(days[0].gapReasons).toEqual([{ reason: 'Machine Breakdown', totalMinutes: 30 }]);

    // Day 2: two shift entries summed, over-achieved, no downtime.
    expect(days[1]).toMatchObject({
      plannedQty: 100,
      actualQty: 110,
      gap: 10,
      achievementPct: 110,
      noDataLogged: false,
    });
    expect(days[1].gapReasons).toEqual([]);

    // Day 3: nothing logged at all.
    expect(days[2]).toMatchObject({
      plannedQty: 50,
      actualQty: 0,
      gap: -50,
      achievementPct: 0,
      noDataLogged: true,
    });
    expect(days[2].gapReasons).toEqual([]);

    expect(res.body.data.summary).toEqual({
      cumulativePlannedQty: 250,
      cumulativeActualQty: 190,
      overallAchievementPct: 76,
    });
  });

  it('returns 404 when no plan exists yet for the order', async () => {
    const res = await request(app)
      .get(`/api/production-plan/${noPlanYetOrderId}/plan-vs-actual`)
      .set(readOnlyHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/production-plan/:orderId/completion-forecast (Client Flow Part 4A)', () => {
  it('projects an on-track completion date from 7 days of real accepted production', async () => {
    const res = await request(app)
      .get(`/api/production-plan/${forecastOnTrackOrderId}/completion-forecast`)
      .set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      orderId: forecastOnTrackOrderId,
      balanceQty: 300,
      currentAvgDailyAccepted: 100,
      remainingProductionDays: 3,
      isDelayedByForecast: false,
      windowDaysUsed: 7,
    });
    expect(res.body.data.noDataReason).toBeUndefined();
    expect(new Date(res.body.data.expectedCompletionDate)).toEqual(daysFromToday(3));
  });

  it('returns a clear no-data reason and null projection fields when there is no recent accepted production', async () => {
    const res = await request(app)
      .get(`/api/production-plan/${forecastNoDataOrderId}/completion-forecast`)
      .set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.balanceQty).toBe(500);
    expect(res.body.data.currentAvgDailyAccepted).toBe(0);
    expect(res.body.data.remainingProductionDays).toBeNull();
    expect(res.body.data.expectedCompletionDate).toBeNull();
    expect(res.body.data.isDelayedByForecast).toBeNull();
    expect(res.body.data.noDataReason).toMatch(/No accepted .* production recorded/);
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app)
      .get('/api/production-plan/DOES-NOT-EXIST/completion-forecast')
      .set(readOnlyHeader);
    expect(res.status).toBe(404);
  });
});
