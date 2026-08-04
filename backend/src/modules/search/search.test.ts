import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import searchRouter from './search.routes';

const app = buildTestApp('/api/search', searchRouter);

let readHeader: { Authorization: string };

// Deliberately NOT the real prisma/seed.ts rows — see README "Module 12" for
// why: seeding the shared test database with the real seed dataset (e.g.
// SO-1001 against SP10B2's BOM, which has a genuine RM shortfall against
// seeded stock) would silently break Module 9's "no purchase requirement"
// test, which sums BOM requirements across ALL non-Closed orders in the
// test DB by design and currently relies on it starting clean. This module
// follows the same isolated, self-cleaning TEST-prefixed-fixture convention
// every other module's test file already uses instead.
const testModelId = 'TEST-MDL-SEARCH-ZQX';
const testSku = 'TEST-SKU-SEARCH-ZQX';
const testProductType = 'OTG Search Test ZQX';
const testLineId = 'TEST-LINE-SEARCH-ZQX';
const testOrderScheduledId = 'TEST-SO-SEARCH-ZQX-1';
const testOrderUnscheduledId = 'TEST-SO-SEARCH-ZQX-2';
const allOrderIds = [testOrderScheduledId, testOrderUnscheduledId];

beforeAll(async () => {
  readHeader = await getAuthHeader(UserRole.ProductionManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Zqx Search Test Model',
      productType: testProductType,
      sku: testSku,
      taktTimeSec: 60,
      manpowerRequired: 1,
      noOfStations: 2,
    },
  });

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'Zqx Search Test Line', maxWorkers: 5, efficiencyPct: 100, status: 'Active' },
  });

  await prisma.order.create({
    data: {
      orderId: testOrderScheduledId,
      client: 'Zqx Search Client',
      sku: testSku,
      product: testProductType,
      qty: 100,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
  await prisma.order.create({
    data: {
      orderId: testOrderUnscheduledId,
      client: 'Zqx Search Client',
      sku: testSku,
      product: testProductType,
      qty: 50,
      dueDate: new Date('2026-09-15T00:00:00.000Z'),
    },
  });

  await prisma.productionSchedule.create({
    data: {
      orderId: testOrderScheduledId,
      client: 'Zqx Search Client',
      sku: testSku,
      product: testProductType,
      qty: 100,
      lineId: testLineId,
      lineName: 'Zqx Search Test Line',
      dailyOutput: 480,
      workersPresent: 1,
      workersRequired: 1,
      daysNeeded: 1,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      estEndDate: new Date('2026-08-01T00:00:00.000Z'),
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
      slackDays: 31,
      status: 'OnTrack',
    },
  });
});

afterAll(async () => {
  await prisma.productionSchedule.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('GET /api/search', () => {
  it('rejects a query shorter than 2 characters', async () => {
    const res = await request(app).get('/api/search').set(readHeader).query({ q: 'a' });
    expect(res.status).toBe(400);
  });

  it('returns matching orders first by orderId prefix, both carrying the pendingQty gap note', async () => {
    const res = await request(app).get('/api/search').set(readHeader).query({ q: 'TEST-SO-SEARCH-ZQX' });
    expect(res.status).toBe(200);
    expect(res.body.data.query).toBe('TEST-SO-SEARCH-ZQX');

    const orderIds = res.body.data.orders.map((o: { orderId: string }) => o.orderId);
    expect(orderIds).toEqual(expect.arrayContaining([testOrderScheduledId, testOrderUnscheduledId]));

    for (const order of res.body.data.orders) {
      expect(order.pendingQty).toBeNull();
      expect(order.pendingQtyNote).toMatch(/not currently tied to specific orders/);
    }
  });

  it('populates expectedCompletionDate for a scheduled order and null+note for an unscheduled one', async () => {
    const res = await request(app).get('/api/search').set(readHeader).query({ q: 'TEST-SO-SEARCH-ZQX' });
    expect(res.status).toBe(200);

    const scheduled = res.body.data.orders.find((o: { orderId: string }) => o.orderId === testOrderScheduledId);
    const unscheduled = res.body.data.orders.find((o: { orderId: string }) => o.orderId === testOrderUnscheduledId);

    expect(scheduled.expectedCompletionDate).not.toBeNull();
    expect(scheduled.expectedCompletionDateNote).toBeNull();

    expect(unscheduled.expectedCompletionDate).toBeNull();
    expect(unscheduled.expectedCompletionDateNote).toMatch(/Not yet scheduled/);
  });

  it('exposes currentStage and materialStatus from the order itself', async () => {
    const res = await request(app).get('/api/search').set(readHeader).query({ q: testOrderUnscheduledId });
    expect(res.status).toBe(200);
    const order = res.body.data.orders.find((o: { orderId: string }) => o.orderId === testOrderUnscheduledId);
    expect(order.currentStage).toBe('Open');
    expect(order.materialStatus).toBeNull();
  });

  it('returns matching products by sku substring', async () => {
    const res = await request(app).get('/api/search').set(readHeader).query({ q: 'SEARCH-ZQX' });
    expect(res.status).toBe(200);
    const skus = res.body.data.products.map((p: { sku: string }) => p.sku);
    expect(skus).toContain(testSku);
  });

  it('returns matching lines by lineId prefix', async () => {
    const res = await request(app).get('/api/search').set(readHeader).query({ q: testLineId });
    expect(res.status).toBe(200);
    const lineIds = res.body.data.lines.map((l: { lineId: string }) => l.lineId);
    expect(lineIds).toContain(testLineId);
  });

  it('returns empty arrays cleanly for a query with no matches, not an error', async () => {
    const res = await request(app).get('/api/search').set(readHeader).query({ q: 'nomatchquerywhatsoeverxyz999' });
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toEqual([]);
    expect(res.body.data.products).toEqual([]);
    expect(res.body.data.lines).toEqual([]);
  });
});
