import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import purchaseItemsRouter from './purchaseItems.routes';

const app = buildTestApp('/api/purchase-items', purchaseItemsRouter);

const testRmPartId = 'TEST-PART-PI-001';
const testItemCode = 'TEST-PI-RM-001';
const consumableItemCode = 'TEST-PI-CONS-001';
const secondConsumableItemCode = 'TEST-PI-CONS-002';

let adminHeader: { Authorization: string };
let readHeader: { Authorization: string };

beforeAll(async () => {
  adminHeader = await getAuthHeader(UserRole.Admin);
  readHeader = await getAuthHeader(UserRole.StoreManager);
  await prisma.rmInventory.create({ data: { partId: testRmPartId, stock: 100 } });
});

afterAll(async () => {
  await prisma.purchaseItem.deleteMany({
    where: { itemCode: { in: [testItemCode, consumableItemCode, secondConsumableItemCode] } },
  });
  await prisma.rmInventory.deleteMany({ where: { partId: testRmPartId } });
  await prisma.$disconnect();
});

describe('POST /api/purchase-items — RM linkage validation', () => {
  it('creates a RawMaterial item with a valid rmPartId', async () => {
    const res = await request(app).post('/api/purchase-items').set(adminHeader).send({
      itemCode: testItemCode,
      itemName: 'Test RM Item',
      category: 'RawMaterial',
      uom: 'Kg',
      rmPartId: testRmPartId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.rmPartId).toBe(testRmPartId);
  });

  it('rejects a RawMaterial item with no rmPartId', async () => {
    const res = await request(app).post('/api/purchase-items').set(adminHeader).send({
      itemCode: 'TEST-PI-RM-MISSING',
      itemName: 'Missing RM Link',
      category: 'RawMaterial',
      uom: 'Kg',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/rmPartId is required/);
  });

  it('rejects a RawMaterial item whose rmPartId does not exist in rm_inventory', async () => {
    const res = await request(app).post('/api/purchase-items').set(adminHeader).send({
      itemCode: 'TEST-PI-RM-NOTFOUND',
      itemName: 'Nonexistent RM Link',
      category: 'RawMaterial',
      uom: 'Kg',
      rmPartId: 'DOES-NOT-EXIST-IN-RM-INVENTORY',
    });
    expect(res.status).toBe(404);
  });

  it('creates a non-RawMaterial item with no rmPartId', async () => {
    const res = await request(app).post('/api/purchase-items').set(adminHeader).send({
      itemCode: consumableItemCode,
      itemName: 'Test Consumable Item',
      category: 'Consumables',
      uom: 'Pcs',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.rmPartId).toBeNull();
  });

  it('rejects a non-RawMaterial item that supplies an rmPartId', async () => {
    const res = await request(app).post('/api/purchase-items').set(adminHeader).send({
      itemCode: secondConsumableItemCode,
      itemName: 'Test Consumable With RM Link',
      category: 'Consumables',
      uom: 'Pcs',
      rmPartId: testRmPartId,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/must not be set/);
  });

  it('rejects a StoreManager (not Admin) with 403', async () => {
    const res = await request(app).post('/api/purchase-items').set(readHeader).send({
      itemCode: 'TEST-PI-FORBIDDEN',
      itemName: 'Forbidden',
      category: 'Services',
      uom: 'Job',
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/purchase-items/:code — RM linkage validation on the merged state', () => {
  it('rejects switching an item to RawMaterial without also supplying rmPartId', async () => {
    const res = await request(app)
      .patch(`/api/purchase-items/${consumableItemCode}`)
      .set(adminHeader)
      .send({ category: 'RawMaterial' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/rmPartId is required/);
  });

  it('allows switching an item to RawMaterial when rmPartId is supplied in the same request', async () => {
    const res = await request(app)
      .patch(`/api/purchase-items/${consumableItemCode}`)
      .set(adminHeader)
      .send({ category: 'RawMaterial', rmPartId: testRmPartId });
    expect(res.status).toBe(200);
    expect(res.body.data.category).toBe('RawMaterial');
    expect(res.body.data.rmPartId).toBe(testRmPartId);
  });

  it('rejects clearing rmPartId while category stays RawMaterial', async () => {
    const res = await request(app)
      .patch(`/api/purchase-items/${consumableItemCode}`)
      .set(adminHeader)
      .send({ rmPartId: null });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/rmPartId is required/);
  });

  it('allows clearing rmPartId together with switching category away from RawMaterial', async () => {
    const res = await request(app)
      .patch(`/api/purchase-items/${consumableItemCode}`)
      .set(adminHeader)
      .send({ category: 'Consumables', rmPartId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.rmPartId).toBeNull();
  });
});

describe('GET /api/purchase-items', () => {
  it('lists items filterable by category', async () => {
    const res = await request(app).get('/api/purchase-items').set(readHeader).query({ category: 'RawMaterial' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((i: { itemCode: string }) => i.itemCode === testItemCode)).toBe(true);
    expect(res.body.data.items.every((i: { category: string }) => i.category === 'RawMaterial')).toBe(true);
  });
});

describe('GET /api/purchase-items/:code', () => {
  it('returns 404 for an unknown itemCode', async () => {
    const res = await request(app).get('/api/purchase-items/DOES-NOT-EXIST').set(readHeader);
    expect(res.status).toBe(404);
  });
});
