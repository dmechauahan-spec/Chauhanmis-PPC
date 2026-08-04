import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import bomExplosionRouter from './bomExplosion.routes';

const app = buildTestApp('/api/bom-explosion', bomExplosionRouter);

// StoreManager satisfies both read and write access for this module — used
// for every request below.
let storeManagerHeader: { Authorization: string };

const testModelId = 'TEST-MDL-BOMX-001';
const testSku = 'TEST-SKU-BOMX-001';
const testPartA = 'TEST-PART-BOMX-A';
const testPartB = 'TEST-PART-BOMX-B';
const testOrderId = 'TEST-SO-BOMX-001';
const noBomModelId = 'TEST-MDL-BOMX-NOBOM';
const noBomSku = 'TEST-SKU-BOMX-NOBOM';
const noBomOrderId = 'TEST-SO-BOMX-NOBOM';

beforeAll(async () => {
  storeManagerHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'BOM Explosion Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: 40,
      manpowerRequired: 4,
      noOfStations: 5,
    },
  });
  await prisma.product.create({
    data: {
      modelId: noBomModelId,
      modelName: 'BOM Explosion Test Model (no BOM)',
      productType: 'OTG',
      sku: noBomSku,
      taktTimeSec: 40,
      manpowerRequired: 4,
      noOfStations: 5,
    },
  });

  await prisma.rmInventory.create({ data: { partId: testPartA, stock: 1000 } });
  await prisma.rmInventory.create({ data: { partId: testPartB, stock: 1000 } });

  await prisma.bomComponent.createMany({
    data: [
      { modelRef: testSku, partId: testPartA, partName: 'Test Part A', qtyPerUnit: 2 },
      { modelRef: testSku, partId: testPartB, partName: 'Test Part B', qtyPerUnit: 1 },
    ],
  });

  await prisma.order.create({
    data: { orderId: testOrderId, client: 'BOM Explosion Test Client', sku: testSku, product: 'OTG', qty: 500 },
  });
  await prisma.order.create({
    data: { orderId: noBomOrderId, client: 'BOM Explosion Test Client', sku: noBomSku, product: 'OTG', qty: 10 },
  });
});

afterAll(async () => {
  await prisma.orderBomRequirement.deleteMany({ where: { orderId: { in: [testOrderId, noBomOrderId] } } });
  await prisma.order.deleteMany({ where: { orderId: { in: [testOrderId, noBomOrderId] } } });
  await prisma.bomComponent.deleteMany({ where: { modelRef: testSku } });
  await prisma.rmInventory.deleteMany({ where: { partId: { in: [testPartA, testPartB] } } });
  await prisma.product.deleteMany({ where: { modelId: { in: [testModelId, noBomModelId] } } });
  await prisma.$disconnect();
});

describe('GET /api/bom-explosion/sku/:sku', () => {
  it('explodes a SKU at the given qty into its parts requirement', async () => {
    const res = await request(app).get(`/api/bom-explosion/sku/${testSku}`).set(storeManagerHeader).query({ qty: 500 });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.sku).toBe(testSku);
    expect(data.qty).toBe(500);
    expect(data.totalLines).toBe(2);
    expect(data.maxDepthReached).toBe(0);

    const byPartId = new Map(data.lines.map((l: { partId: string }) => [l.partId, l]));
    expect(byPartId.get(testPartA)).toMatchObject({ requiredQty: 1000, qtyPerUnit: 2, level: 0, sourceSku: testSku });
    expect(byPartId.get(testPartB)).toMatchObject({ requiredQty: 500, qtyPerUnit: 1, level: 0, sourceSku: testSku });
  });

  it('returns 404 for an unknown sku', async () => {
    const res = await request(app).get('/api/bom-explosion/sku/DOES-NOT-EXIST').set(storeManagerHeader).query({ qty: 10 });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a missing qty', async () => {
    const res = await request(app).get(`/api/bom-explosion/sku/${testSku}`).set(storeManagerHeader);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a zero or negative qty', async () => {
    const zero = await request(app).get(`/api/bom-explosion/sku/${testSku}`).set(storeManagerHeader).query({ qty: 0 });
    expect(zero.status).toBe(400);
    const negative = await request(app).get(`/api/bom-explosion/sku/${testSku}`).set(storeManagerHeader).query({ qty: -5 });
    expect(negative.status).toBe(400);
  });
});

describe('GET /api/bom-explosion/order/:orderId — lazy compute + cache', () => {
  it('computes and persists a snapshot on the first call', async () => {
    const res = await request(app).get(`/api/bom-explosion/order/${testOrderId}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.orderId).toBe(testOrderId);
    expect(data.sku).toBe(testSku);
    expect(data.qty).toBe(500);
    expect(data.totalLines).toBe(2);
    expect(data.computedAt).not.toBeNull();

    const persisted = await prisma.orderBomRequirement.findMany({ where: { orderId: testOrderId } });
    expect(persisted).toHaveLength(2);
  });

  it('returns the cached snapshot on a second call instead of recomputing', async () => {
    const first = await request(app).get(`/api/bom-explosion/order/${testOrderId}`).set(storeManagerHeader);
    const second = await request(app).get(`/api/bom-explosion/order/${testOrderId}`).set(storeManagerHeader);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.computedAt).toBe(first.body.data.computedAt);

    const persisted = await prisma.orderBomRequirement.findMany({ where: { orderId: testOrderId } });
    expect(persisted).toHaveLength(2); // still 2, not 4 — no duplicate insert from the second call
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).get('/api/bom-explosion/order/DOES-NOT-EXIST').set(storeManagerHeader);
    expect(res.status).toBe(404);
  });

  it('reports zero lines (not an error) for an order whose sku has no BOM rows', async () => {
    const res = await request(app).get(`/api/bom-explosion/order/${noBomOrderId}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.totalLines).toBe(0);
    expect(res.body.data.lines).toEqual([]);
    expect(res.body.data.computedAt).not.toBeNull();
  });

  it('persists a marker row for a zero-BOM order so the second call is a real cache hit, not a recompute', async () => {
    const first = await request(app).get(`/api/bom-explosion/order/${noBomOrderId}`).set(storeManagerHeader);
    const second = await request(app).get(`/api/bom-explosion/order/${noBomOrderId}`).set(storeManagerHeader);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Same computedAt across both calls proves the second call read the
    // cached marker row rather than recomputing (and re-persisting) again.
    expect(second.body.data.computedAt).toBe(first.body.data.computedAt);
    // The marker row itself is never exposed to the caller.
    expect(second.body.data.totalLines).toBe(0);
    expect(second.body.data.lines).toEqual([]);

    const persisted = await prisma.orderBomRequirement.findMany({ where: { orderId: noBomOrderId } });
    expect(persisted).toHaveLength(1); // exactly the one sentinel row, not zero, not duplicated
    expect(persisted[0]).toMatchObject({ partId: null, partName: '__NO_BOM__' });
  });
});

describe('POST /api/bom-explosion/order/:orderId/recompute', () => {
  it('replaces (not appends to) the cached snapshot rows', async () => {
    const before = await request(app).get(`/api/bom-explosion/order/${testOrderId}`).set(storeManagerHeader);
    expect(before.status).toBe(200);
    const beforeCount = await prisma.orderBomRequirement.count({ where: { orderId: testOrderId } });
    expect(beforeCount).toBe(2);

    const recomputed = await request(app).post(`/api/bom-explosion/order/${testOrderId}/recompute`).set(storeManagerHeader);
    expect(recomputed.status).toBe(200);
    expect(recomputed.body.data.totalLines).toBe(2);
    expect(new Date(recomputed.body.data.computedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before.body.data.computedAt).getTime(),
    );

    const afterCount = await prisma.orderBomRequirement.count({ where: { orderId: testOrderId } });
    expect(afterCount).toBe(2); // replaced, not appended (would be 4 if appended)
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).post('/api/bom-explosion/order/DOES-NOT-EXIST/recompute').set(storeManagerHeader);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/bom-explosion/order/:orderId', () => {
  it('clears the cached snapshot without touching the order itself', async () => {
    await request(app).get(`/api/bom-explosion/order/${testOrderId}`).set(storeManagerHeader); // ensure a snapshot exists

    const del = await request(app).delete(`/api/bom-explosion/order/${testOrderId}`).set(storeManagerHeader);
    expect(del.status).toBe(200);

    const remaining = await prisma.orderBomRequirement.count({ where: { orderId: testOrderId } });
    expect(remaining).toBe(0);

    const order = await prisma.order.findUnique({ where: { orderId: testOrderId } });
    expect(order).not.toBeNull();

    // A subsequent GET lazily recomputes since the cache was cleared.
    const after = await request(app).get(`/api/bom-explosion/order/${testOrderId}`).set(storeManagerHeader);
    expect(after.status).toBe(200);
    expect(after.body.data.totalLines).toBe(2);
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).delete('/api/bom-explosion/order/DOES-NOT-EXIST').set(storeManagerHeader);
    expect(res.status).toBe(404);
  });
});
