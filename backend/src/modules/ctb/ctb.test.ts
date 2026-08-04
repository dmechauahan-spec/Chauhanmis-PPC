import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import ctbRouter from './ctb.routes';

const app = buildTestApp('/api/ctb', ctbRouter);

// StoreManager satisfies both read and write access for this module — used
// for every request below.
let storeManagerHeader: { Authorization: string };

const testModelId = 'TEST-MDL-CTB-001';
const testSku = 'TEST-SKU-CTB-001';
const testPartA = 'TEST-PART-CTB-A'; // always well-stocked
const testPartB = 'TEST-PART-CTB-B'; // deliberately scarce (stock: 5)

const orderClearId = 'TEST-SO-CTB-CLEAR';
const orderShortId = 'TEST-SO-CTB-SHORT';
const orderNeverCheckedId = 'TEST-SO-CTB-NEVERCHECKED';
const orderClosedId = 'TEST-SO-CTB-CLOSED';
const allOrderIds = [orderClearId, orderShortId, orderNeverCheckedId, orderClosedId];

beforeAll(async () => {
  storeManagerHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'CTB Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: 40,
      manpowerRequired: 4,
      noOfStations: 5,
    },
  });

  await prisma.rmInventory.create({ data: { partId: testPartA, stock: 1000 } });
  await prisma.rmInventory.create({ data: { partId: testPartB, stock: 5 } });

  await prisma.bomComponent.createMany({
    data: [
      { modelRef: testSku, partId: testPartA, partName: 'CTB Part A', qtyPerUnit: 1 },
      { modelRef: testSku, partId: testPartB, partName: 'CTB Part B', qtyPerUnit: 1 },
    ],
  });

  // qty 5 -> needs 5 of each; both covered by stock (1000 / 5) -> Clear To Build.
  await prisma.order.create({
    data: { orderId: orderClearId, client: 'CTB Test Client', sku: testSku, product: 'OTG', qty: 5 },
  });
  // qty 50 -> needs 50 of Part B against a stock of 5 -> RM Shortage (short 45).
  await prisma.order.create({
    data: { orderId: orderShortId, client: 'CTB Test Client', sku: testSku, product: 'OTG', qty: 50 },
  });
  // Created but deliberately never evaluated before the dashboard test runs.
  await prisma.order.create({
    data: { orderId: orderNeverCheckedId, client: 'CTB Test Client', sku: testSku, product: 'OTG', qty: 10 },
  });
  // Closed orders must never appear on the dashboard.
  await prisma.order.create({
    data: { orderId: orderClosedId, client: 'CTB Test Client', sku: testSku, product: 'OTG', qty: 10, status: 'Closed' },
  });
});

afterAll(async () => {
  await prisma.orderCtbShortage.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderBomRequirement.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.bomComponent.deleteMany({ where: { modelRef: testSku } });
  await prisma.rmInventory.deleteMany({ where: { partId: { in: [testPartA, testPartB] } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('GET /api/ctb/order/:orderId', () => {
  it('evaluates Clear To Build when stock covers every required part', async () => {
    const res = await request(app).get(`/api/ctb/order/${orderClearId}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.ctbStatus).toBe('Clear To Build');
    expect(data.shortages).toEqual([]);
    expect(data.evaluatedLive).toBe(true);
    expect(data.ctbCheckedAt).not.toBeNull();
  });

  it('evaluates RM Shortage and returns the shortage breakdown when a part is short', async () => {
    const res = await request(app).get(`/api/ctb/order/${orderShortId}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.ctbStatus).toBe('RM Shortage');
    expect(data.evaluatedLive).toBe(true);
    expect(data.shortages).toEqual([
      expect.objectContaining({ partId: testPartB, requiredQty: 50, availableStock: 5, shortQty: 45 }),
    ]);
  });

  it('writes ctbStatus/ctbCheckedAt back onto the order', async () => {
    const order = await prisma.order.findUnique({ where: { orderId: orderShortId } });
    expect(order?.ctbStatus).toBe('RmShortage');
    expect(order?.ctbCheckedAt).not.toBeNull();
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).get('/api/ctb/order/DOES-NOT-EXIST').set(storeManagerHeader);
    expect(res.status).toBe(404);
  });

  it('serves the cached evaluation within the freshness window instead of recomputing', async () => {
    // Force a known-live baseline first, independent of whatever freshness
    // state earlier tests left this order in.
    const baseline = await request(app).post(`/api/ctb/order/${orderShortId}/recheck`).set(storeManagerHeader);
    expect(baseline.body.data.evaluatedLive).toBe(true);

    const cacheHit = await request(app).get(`/api/ctb/order/${orderShortId}`).set(storeManagerHeader);
    expect(cacheHit.body.data.evaluatedLive).toBe(false);
    // Same ctbCheckedAt proves this call did not re-evaluate/re-write.
    expect(cacheHit.body.data.ctbCheckedAt).toBe(baseline.body.data.ctbCheckedAt);
    // Shortages still come back correctly from the persisted breakdown.
    expect(cacheHit.body.data.ctbStatus).toBe('RM Shortage');
    expect(cacheHit.body.data.shortages).toEqual(baseline.body.data.shortages);
  });
});

describe('POST /api/ctb/order/:orderId/recheck', () => {
  it('always evaluates live, even immediately after a fresh cache-covered GET', async () => {
    await request(app).post(`/api/ctb/order/${orderClearId}/recheck`).set(storeManagerHeader); // establish a known-fresh baseline
    const cached = await request(app).get(`/api/ctb/order/${orderClearId}`).set(storeManagerHeader);
    expect(cached.body.data.evaluatedLive).toBe(false); // within the freshness window

    const rechecked = await request(app).post(`/api/ctb/order/${orderClearId}/recheck`).set(storeManagerHeader);
    expect(rechecked.status).toBe(200);
    expect(rechecked.body.data.evaluatedLive).toBe(true);
    expect(new Date(rechecked.body.data.ctbCheckedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(cached.body.data.ctbCheckedAt).getTime(),
    );
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).post('/api/ctb/order/DOES-NOT-EXIST/recheck').set(storeManagerHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/ctb/dashboard', () => {
  it('flags an unevaluated order with neverChecked: true and ctbStatus: null', async () => {
    const res = await request(app).get('/api/ctb/dashboard').set(storeManagerHeader).query({ pageSize: 100 });
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((i: { orderId: string }) => i.orderId === orderNeverCheckedId);
    expect(row).toMatchObject({ ctbStatus: null, ctbCheckedAt: null, neverChecked: true });
  });

  it('never includes Closed orders, even when explicitly filtered for', async () => {
    const res = await request(app).get('/api/ctb/dashboard').set(storeManagerHeader).query({ pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((i: { orderId: string }) => i.orderId === orderClosedId)).toBe(false);

    const closedFilter = await request(app).get('/api/ctb/dashboard').set(storeManagerHeader).query({ status: 'Closed', pageSize: 100 });
    expect(closedFilter.status).toBe(200);
    expect(closedFilter.body.data.items).toEqual([]);
  });

  it('includes the shortage breakdown only for RM Shortage orders, filterable by ctbStatus', async () => {
    await request(app).post(`/api/ctb/order/${orderShortId}/recheck`).set(storeManagerHeader); // ensure it's evaluated + RM Shortage
    const res = await request(app).get('/api/ctb/dashboard').set(storeManagerHeader).query({ ctbStatus: 'RM Shortage', pageSize: 100 });
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((i: { orderId: string }) => i.orderId === orderShortId);
    expect(row).toBeDefined();
    expect(row.ctbStatus).toBe('RM Shortage');
    expect(row.shortages.length).toBeGreaterThan(0);
    expect(res.body.data.items.every((i: { ctbStatus: string }) => i.ctbStatus === 'RM Shortage')).toBe(true);
  });
});

describe('POST /api/ctb/recheck-all', () => {
  it('evaluates every non-Closed order in one call and returns a summary, including the never-checked order', async () => {
    const res = await request(app).post('/api/ctb/recheck-all').set(storeManagerHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.totalEvaluated).toBeGreaterThanOrEqual(3); // at least our 3 non-Closed fixtures
    expect(data.clearToBuildCount + data.rmShortageCount).toBe(data.totalEvaluated);

    const neverChecked = await prisma.order.findUnique({ where: { orderId: orderNeverCheckedId } });
    expect(neverChecked?.ctbStatus).not.toBeNull();
    expect(neverChecked?.ctbCheckedAt).not.toBeNull();

    // qty 10 against a Part B stock of 5 -> still short.
    expect(neverChecked?.ctbStatus).toBe('RmShortage');
    const shortageRows = await prisma.orderCtbShortage.findMany({ where: { orderId: orderNeverCheckedId } });
    expect(shortageRows.length).toBeGreaterThan(0);
  });
});
