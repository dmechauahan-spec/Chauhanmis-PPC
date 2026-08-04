import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import materialsRouter from './materials.routes';

const app = buildTestApp('/api/materials', materialsRouter);

// StoreManager satisfies both read and write access for this module — used
// for every request below.
let storeManagerHeader: { Authorization: string };

const testModelId = 'TEST-MDL-MAT-001';
const testSku = 'TEST-SKU-MAT-001';

const partHigh = 'TEST-PART-MAT-HIGH'; // touched by one High-priority order, small shortage
const partLow = 'TEST-PART-MAT-LOW'; // touched by two Low-priority orders, large total shortage
const partCritical = 'TEST-PART-MAT-CRIT'; // stock 10, threshold 25 -> deficit 15
const partSafe = 'TEST-PART-MAT-SAFE'; // stock 100, threshold 10 -> NOT critical (stock > threshold)
const partNoThreshold = 'TEST-PART-MAT-NOTHRESH'; // threshold null -> never in critical list
const partForClear = 'TEST-PART-MAT-CLEARME'; // starts with no threshold; test sets then clears it
const allPartIds = [partHigh, partLow, partCritical, partSafe, partNoThreshold, partForClear];

const orderHighId = 'TEST-SO-MAT-HIGH';
const orderLow1Id = 'TEST-SO-MAT-LOW1';
const orderLow2Id = 'TEST-SO-MAT-LOW2';
const orderClosedId = 'TEST-SO-MAT-CLOSED';
const allOrderIds = [orderHighId, orderLow1Id, orderLow2Id, orderClosedId];

beforeAll(async () => {
  storeManagerHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Materials Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: 40,
      manpowerRequired: 4,
      noOfStations: 5,
    },
  });

  await prisma.rmInventory.createMany({
    data: [
      { partId: partHigh, stock: 9 },
      { partId: partLow, stock: 100 },
      { partId: partCritical, stock: 10, criticalThreshold: 25 },
      { partId: partSafe, stock: 100, criticalThreshold: 10 },
      { partId: partNoThreshold, stock: 5 },
      { partId: partForClear, stock: 1 },
    ],
  });

  // Gives partHigh/partLow a resolvable display name via the most-recent
  // bom_components row referencing them; partCritical/partSafe/partNoThreshold/
  // partForClear are deliberately never referenced in any BOM, to exercise the
  // partId-as-fallback-name path.
  await prisma.bomComponent.createMany({
    data: [
      { modelRef: testSku, partId: partHigh, partName: 'Material High Part', qtyPerUnit: 1 },
      { modelRef: testSku, partId: partLow, partName: 'Material Low Part', qtyPerUnit: 1 },
    ],
  });

  await prisma.order.createMany({
    data: [
      { orderId: orderHighId, client: 'Acme High', sku: testSku, product: 'OTG', qty: 10, priority: 'High', ctbStatus: 'RmShortage' },
      { orderId: orderLow1Id, client: 'Acme Low 1', sku: testSku, product: 'OTG', qty: 600, priority: 'Low', ctbStatus: 'RmShortage' },
      { orderId: orderLow2Id, client: 'Acme Low 2', sku: testSku, product: 'OTG', qty: 600, priority: 'Low', ctbStatus: 'RmShortage' },
      { orderId: orderClosedId, client: 'Acme Closed', sku: testSku, product: 'OTG', qty: 999, priority: 'High', status: 'Closed', ctbStatus: 'RmShortage' },
    ],
  });

  // Module 7 reads order_ctb_shortages directly (it's Module 6's persisted
  // output) — inserted here directly rather than driving a live CTB
  // evaluation, so this test suite doesn't depend on Module 6's internals.
  await prisma.orderCtbShortage.createMany({
    data: [
      { orderId: orderHighId, partId: partHigh, partName: 'Material High Part', requiredQty: 10, availableStock: 9, shortQty: 1 },
      { orderId: orderLow1Id, partId: partLow, partName: 'Material Low Part', requiredQty: 600, availableStock: 100, shortQty: 500 },
      { orderId: orderLow2Id, partId: partLow, partName: 'Material Low Part', requiredQty: 600, availableStock: 100, shortQty: 500 },
      // Stale shortage row for a now-Closed order — must be excluded everywhere.
      { orderId: orderClosedId, partId: partHigh, partName: 'Material High Part', requiredQty: 999, availableStock: 0, shortQty: 999 },
    ],
  });

  await prisma.rmTransaction.createMany({
    data: [
      { partId: partHigh, delta: 20, reason: 'Initial stock' },
      { partId: partHigh, delta: -11, reason: 'Consumed on line' },
    ],
  });
});

afterAll(async () => {
  await prisma.rmTransaction.deleteMany({ where: { partId: { in: allPartIds } } });
  await prisma.orderCtbShortage.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.bomComponent.deleteMany({ where: { modelRef: testSku } });
  await prisma.rmInventory.deleteMany({ where: { partId: { in: allPartIds } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('GET /api/materials/shortages', () => {
  it('groups shortages by part, sums quantities, and excludes Closed orders even with a stale shortage row', async () => {
    const res = await request(app).get('/api/materials/shortages').set(storeManagerHeader).query({ pageSize: 50 });
    expect(res.status).toBe(200);
    const byPartId = new Map(res.body.data.items.map((i: { partId: string }) => [i.partId, i]));

    expect(byPartId.get(partHigh)).toMatchObject({
      partName: 'Material High Part',
      totalShortQty: 1, // NOT 1000 — the Closed order's stale row must not count
      affectedOrderCount: 1,
      highestPriority: 'High',
    });
    expect(byPartId.get(partLow)).toMatchObject({
      totalShortQty: 1000,
      affectedOrderCount: 2,
      highestPriority: 'Low',
    });
  });

  it('sorts a smaller-total High-priority part above a larger-total Low-priority part', async () => {
    const res = await request(app).get('/api/materials/shortages').set(storeManagerHeader).query({ pageSize: 50 });
    const ids = res.body.data.items.map((i: { partId: string }) => i.partId);
    expect(ids.indexOf(partHigh)).toBeLessThan(ids.indexOf(partLow));
  });

  it('filters by partId', async () => {
    const res = await request(app).get('/api/materials/shortages').set(storeManagerHeader).query({ partId: partLow });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].partId).toBe(partLow);
  });

  it('filters by priority (part must have at least one affecting order at or above this priority)', async () => {
    const highOnly = await request(app).get('/api/materials/shortages').set(storeManagerHeader).query({ priority: 'High', pageSize: 50 });
    const highIds = highOnly.body.data.items.map((i: { partId: string }) => i.partId);
    expect(highIds).toContain(partHigh);
    expect(highIds).not.toContain(partLow);

    const lowOrAbove = await request(app).get('/api/materials/shortages').set(storeManagerHeader).query({ priority: 'Low', pageSize: 50 });
    const lowIds = lowOrAbove.body.data.items.map((i: { partId: string }) => i.partId);
    expect(lowIds).toEqual(expect.arrayContaining([partHigh, partLow]));
  });
});

describe('GET /api/materials/critical', () => {
  it('returns only parts at/below their threshold, sorted by deficit desc', async () => {
    const res = await request(app).get('/api/materials/critical').set(storeManagerHeader);
    expect(res.status).toBe(200);
    const byPartId = new Map(res.body.data.map((i: { partId: string }) => [i.partId, i]));

    expect(byPartId.get(partCritical)).toMatchObject({ stock: 10, criticalThreshold: 25, deficit: 15 });
    expect(byPartId.has(partSafe)).toBe(false); // stock (100) > threshold (10)
    expect(byPartId.has(partNoThreshold)).toBe(false); // no threshold set at all
  });
});

describe('PATCH /api/materials/:partId/critical-threshold', () => {
  it('sets a threshold, making the part appear in the critical list if stock is at/below it', async () => {
    const patch = await request(app).patch(`/api/materials/${partForClear}/critical-threshold`).set(storeManagerHeader).send({ criticalThreshold: 8 });
    expect(patch.status).toBe(200);
    expect(Number(patch.body.data.criticalThreshold)).toBe(8);

    const critical = await request(app).get('/api/materials/critical').set(storeManagerHeader);
    expect(critical.body.data.some((i: { partId: string }) => i.partId === partForClear)).toBe(true);
  });

  it('clears a threshold with criticalThreshold: null, removing it from the critical list', async () => {
    const patch = await request(app).patch(`/api/materials/${partForClear}/critical-threshold`).set(storeManagerHeader).send({ criticalThreshold: null });
    expect(patch.status).toBe(200);
    expect(patch.body.data.criticalThreshold).toBeNull();

    const critical = await request(app).get('/api/materials/critical').set(storeManagerHeader);
    expect(critical.body.data.some((i: { partId: string }) => i.partId === partForClear)).toBe(false);
  });

  it('rejects a negative threshold', async () => {
    const res = await request(app).patch(`/api/materials/${partForClear}/critical-threshold`).set(storeManagerHeader).send({ criticalThreshold: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown partId', async () => {
    const res = await request(app)
      .patch('/api/materials/DOES-NOT-EXIST/critical-threshold')
      .set(storeManagerHeader)
      .send({ criticalThreshold: 5 });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/materials/summary', () => {
  it('composes counts from the shortages and critical data sources', async () => {
    const res = await request(app).get('/api/materials/summary').set(storeManagerHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.totalShortagePartsCount).toBeGreaterThanOrEqual(2); // partHigh, partLow
    expect(data.totalCriticalPartsCount).toBeGreaterThanOrEqual(1); // partCritical
    expect(data.totalAffectedOrdersCount).toBeGreaterThanOrEqual(3); // orderHigh, orderLow1, orderLow2 (not Closed)
    expect(data.affectedOrdersByPriority.High).toBeGreaterThanOrEqual(1);
    expect(data.affectedOrdersByPriority.Low).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/materials/:partId', () => {
  it('returns part detail with resolved partName, deficit, and affected orders (excluding Closed)', async () => {
    const res = await request(app).get(`/api/materials/${partHigh}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.partName).toBe('Material High Part');
    expect(data.stock).toBe(9);
    expect(data.totalShortQty).toBe(1);
    expect(data.affectedOrders).toHaveLength(1);
    expect(data.affectedOrders[0].orderId).toBe(orderHighId);
  });

  it('reports criticalThreshold/deficit for a critical part with no shortage orders', async () => {
    const res = await request(app).get(`/api/materials/${partCritical}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.criticalThreshold).toBe(25);
    expect(data.deficit).toBe(15);
    expect(data.affectedOrders).toEqual([]);
  });

  it('falls back to partId as the display name when the part has never appeared in any BOM', async () => {
    const res = await request(app).get(`/api/materials/${partNoThreshold}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.partName).toBe(partNoThreshold);
    expect(res.body.data.criticalThreshold).toBeNull();
    expect(res.body.data.deficit).toBeNull();
  });

  it('returns recent rm_transactions for the part', async () => {
    const res = await request(app).get(`/api/materials/${partHigh}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.recentTransactions.length).toBe(2);
    expect(res.body.data.recentTransactions.map((t: { reason: string }) => t.reason)).toEqual(
      expect.arrayContaining(['Initial stock', 'Consumed on line']),
    );
  });

  it('returns 404 for an unknown partId', async () => {
    const res = await request(app).get('/api/materials/DOES-NOT-EXIST').set(storeManagerHeader);
    expect(res.status).toBe(404);
  });
});
