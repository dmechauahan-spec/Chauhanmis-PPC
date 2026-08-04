import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import riskRouter from './risk.routes';

const app = buildTestApp('/api/risk', riskRouter);

let readHeader: { Authorization: string };

const testModelId = 'TEST-MDL-RISK-001';
const testSku = 'TEST-SKU-RISK-001';
const testProductType = 'OTG Risk Test';
const testLineId = 'TEST-LINE-RISK-001';
const testLine2Id = 'TEST-LINE-RISK-002';
const testTeamId = 'TEST-HR-RISK-001';
const testTeam2Id = 'TEST-HR-RISK-002';

const orderAtRisk1Id = 'TEST-SO-RISK-1'; // High priority, worse (less negative slack), on testLineId
const orderAtRisk2Id = 'TEST-SO-RISK-2'; // Low priority, worst slack, on testLine2Id
const orderOnTrackId = 'TEST-SO-RISK-ONTRACK';
const orderNotScheduledId = 'TEST-SO-RISK-NOSCHED';
const allOrderIds = [orderAtRisk1Id, orderAtRisk2Id, orderOnTrackId, orderNotScheduledId];

const DAY0 = new Date('2026-08-01T00:00:00.000Z');
function daysAfter(days: number): Date {
  return new Date(DAY0.getTime() + days * 86_400_000);
}

beforeAll(async () => {
  readHeader = await getAuthHeader(UserRole.ProductionManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Risk Test Model',
      productType: testProductType,
      sku: testSku,
      taktTimeSec: 60,
      manpowerRequired: 1,
      noOfStations: 2,
    },
  });

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'Risk Test Line 1', maxWorkers: 10, efficiencyPct: 100, status: 'Active' },
  });
  await prisma.productionLine.create({
    data: { lineId: testLine2Id, lineName: 'Risk Test Line 2', maxWorkers: 10, efficiencyPct: 100, status: 'Active' },
  });
  await prisma.lineProductCompatibility.create({ data: { lineId: testLineId, productType: testProductType } });
  await prisma.lineProductCompatibility.create({ data: { lineId: testLine2Id, productType: testProductType } });
  await prisma.hrTeam.create({ data: { teamId: testTeamId, teamName: 'Risk Test Team 1', lineId: testLineId, workers: 1 } });
  await prisma.hrTeam.create({ data: { teamId: testTeam2Id, teamName: 'Risk Test Team 2', lineId: testLine2Id, workers: 1 } });

  await prisma.order.create({
    data: { orderId: orderAtRisk1Id, client: 'Risk Test Client', sku: testSku, product: testProductType, qty: 1000, priority: 'High', dueDate: DAY0 },
  });
  await prisma.order.create({
    data: { orderId: orderAtRisk2Id, client: 'Risk Test Client', sku: testSku, product: testProductType, qty: 200, priority: 'Low', dueDate: DAY0 },
  });
  await prisma.order.create({
    data: { orderId: orderOnTrackId, client: 'Risk Test Client', sku: testSku, product: testProductType, qty: 100, priority: 'Medium', dueDate: daysAfter(30) },
  });
  await prisma.order.create({
    data: { orderId: orderNotScheduledId, client: 'Risk Test Client', sku: testSku, product: testProductType, qty: 50 },
  });

  // qty 1000 @ 480/day (60s takt, 1/1 worker, 100% eff) -> 3 days -> estEnd day2; due day0 -> slack -2.
  await prisma.productionSchedule.create({
    data: {
      orderId: orderAtRisk1Id,
      client: 'Risk Test Client',
      sku: testSku,
      product: testProductType,
      qty: 1000,
      lineId: testLineId,
      lineName: 'Risk Test Line 1',
      dailyOutput: 480,
      workersPresent: 1,
      workersRequired: 1,
      daysNeeded: 3,
      startDate: DAY0,
      estEndDate: daysAfter(2),
      dueDate: DAY0,
      slackDays: -2,
      status: 'AtRisk',
    },
  });
  // Worse slack, different line, Low priority.
  await prisma.productionSchedule.create({
    data: {
      orderId: orderAtRisk2Id,
      client: 'Risk Test Client',
      sku: testSku,
      product: testProductType,
      qty: 200,
      lineId: testLine2Id,
      lineName: 'Risk Test Line 2',
      dailyOutput: 480,
      workersPresent: 1,
      workersRequired: 1,
      daysNeeded: 5,
      startDate: DAY0,
      estEndDate: daysAfter(4),
      dueDate: DAY0,
      slackDays: -5,
      status: 'AtRisk',
    },
  });
  await prisma.productionSchedule.create({
    data: {
      orderId: orderOnTrackId,
      client: 'Risk Test Client',
      sku: testSku,
      product: testProductType,
      qty: 100,
      lineId: testLineId,
      lineName: 'Risk Test Line 1',
      dailyOutput: 480,
      workersPresent: 1,
      workersRequired: 1,
      daysNeeded: 1,
      startDate: DAY0,
      estEndDate: DAY0,
      dueDate: daysAfter(30),
      slackDays: 30,
      status: 'OnTrack',
    },
  });
});

afterAll(async () => {
  await prisma.productionSchedule.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.hrTeam.deleteMany({ where: { teamId: { in: [testTeamId, testTeam2Id] } } });
  await prisma.lineProductCompatibility.deleteMany({ where: { lineId: { in: [testLineId, testLine2Id] } } });
  await prisma.productionLine.deleteMany({ where: { lineId: { in: [testLineId, testLine2Id] } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('GET /api/risk/at-risk-orders', () => {
  it('sorts by slackDays ascending (worst first) by default', async () => {
    const res = await request(app).get('/api/risk/at-risk-orders').set(readHeader).query({ pageSize: 100 });
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((r: { orderId: string }) => r.orderId);
    expect(ids.indexOf(orderAtRisk2Id)).toBeLessThan(ids.indexOf(orderAtRisk1Id)); // -5 before -2
    expect(ids).not.toContain(orderOnTrackId);
  });

  it('filters by priority', async () => {
    const res = await request(app).get('/api/risk/at-risk-orders').set(readHeader).query({ priority: 'High', pageSize: 100 });
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((r: { orderId: string }) => r.orderId);
    expect(ids).toContain(orderAtRisk1Id);
    expect(ids).not.toContain(orderAtRisk2Id);
  });

  it('filters by lineId', async () => {
    const res = await request(app).get('/api/risk/at-risk-orders').set(readHeader).query({ lineId: testLine2Id, pageSize: 100 });
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((r: { orderId: string }) => r.orderId);
    expect(ids).toEqual([orderAtRisk2Id]);
  });
});

describe('GET /api/risk/at-risk-orders/:orderId/recommendations', () => {
  it('returns all three recommendation options for an At-Risk order', async () => {
    const res = await request(app).get(`/api/risk/at-risk-orders/${orderAtRisk1Id}/recommendations`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.reportStatus).toBe('reported');
    const options = res.body.data.recommendations.options;
    expect(options.map((o: { option: string }) => o.option)).toEqual(['Overtime', 'Extended Shift', 'Additional Line']);
    expect(res.body.data.recommendations.disclaimer).toBeTruthy();
    expect(options.every((o: { isEstimate: boolean }) => o.isEstimate === true)).toBe(true);

    const additionalLine = options.find((o: { option: string }) => o.option === 'Additional Line');
    expect(additionalLine.applicable).toBe(true);
    expect(additionalLine.recommendedLineId).toBe(testLine2Id);
  });

  it('returns not_scheduled for an order with no schedule row', async () => {
    const res = await request(app).get(`/api/risk/at-risk-orders/${orderNotScheduledId}/recommendations`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.reportStatus).toBe('not_scheduled');
    expect(res.body.data.recommendations).toBeNull();
  });

  it('returns not_at_risk for an order whose schedule is On Track', async () => {
    const res = await request(app).get(`/api/risk/at-risk-orders/${orderOnTrackId}/recommendations`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.reportStatus).toBe('not_at_risk');
    expect(res.body.data.recommendations).toBeNull();
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).get('/api/risk/at-risk-orders/DOES-NOT-EXIST/recommendations').set(readHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/risk/summary', () => {
  it('reflects the constructed fixture in its counts', async () => {
    const res = await request(app).get('/api/risk/summary').set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.totalAtRisk).toBeGreaterThanOrEqual(2);
    expect(res.body.data.totalOnTrack).toBeGreaterThanOrEqual(1);
    expect(res.body.data.atRiskByPriority.High).toBeGreaterThanOrEqual(1);
    expect(res.body.data.atRiskByPriority.Low).toBeGreaterThanOrEqual(1);
  });
});
