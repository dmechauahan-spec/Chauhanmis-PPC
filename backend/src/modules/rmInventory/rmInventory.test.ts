import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import rmInventoryRouter from './rmInventory.routes';

const app = buildTestApp('/api/rm-inventory', rmInventoryRouter);

const testPartId = 'TEST-PART-RM-001';

let writeHeader: { Authorization: string }; // StoreManager
let readOnlyHeader: { Authorization: string }; // ProductionManager

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.StoreManager);
  readOnlyHeader = await getAuthHeader(UserRole.ProductionManager);
});

afterAll(async () => {
  await prisma.rmTransaction.deleteMany({ where: { partId: testPartId } });
  await prisma.rmInventory.deleteMany({ where: { partId: testPartId } });
  await prisma.$disconnect();
});

describe('POST /api/rm-inventory', () => {
  it('creates an RM inventory row', async () => {
    const res = await request(app).post('/api/rm-inventory').set(writeHeader).send({ partId: testPartId, stock: 50 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.stock)).toBe(50);
  });

  it('rejects a negative stock value', async () => {
    const res = await request(app)
      .post('/api/rm-inventory')
      .set(writeHeader)
      .send({ partId: 'TEST-PART-INVALID', stock: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a ProductionManager (not StoreManager) with 403', async () => {
    const res = await request(app)
      .post('/api/rm-inventory')
      .set(readOnlyHeader)
      .send({ partId: 'TEST-PART-FORBIDDEN', stock: 10 });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/rm-inventory/:partId/adjust-stock', () => {
  it('increments stock and records a transaction', async () => {
    const res = await request(app)
      .patch(`/api/rm-inventory/${testPartId}/adjust-stock`)
      .set(writeHeader)
      .send({ delta: 25, reason: 'Received new shipment' });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.inventory.stock)).toBe(75);
    expect(res.body.data.transaction.delta).toBeDefined();
  });

  it('decrements stock', async () => {
    const res = await request(app)
      .patch(`/api/rm-inventory/${testPartId}/adjust-stock`)
      .set(writeHeader)
      .send({ delta: -10, reason: 'Consumed on line' });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.inventory.stock)).toBe(65);
  });

  it('rejects an adjustment that would drive stock negative', async () => {
    const res = await request(app)
      .patch(`/api/rm-inventory/${testPartId}/adjust-stock`)
      .set(writeHeader)
      .send({ delta: -1000, reason: 'Too much' });

    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown partId', async () => {
    const res = await request(app)
      .patch('/api/rm-inventory/DOES-NOT-EXIST/adjust-stock')
      .set(writeHeader)
      .send({ delta: 5, reason: 'x' });

    expect(res.status).toBe(404);
  });

  it('rejects a ProductionManager (not StoreManager) with 403 — no special exception for stock-adjust', async () => {
    const res = await request(app)
      .patch(`/api/rm-inventory/${testPartId}/adjust-stock`)
      .set(readOnlyHeader)
      .send({ delta: 1, reason: 'Forbidden' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/rm-inventory/:partId/transactions', () => {
  it('returns the transaction ledger', async () => {
    const res = await request(app).get(`/api/rm-inventory/${testPartId}/transactions`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });
});

describe('DELETE /api/rm-inventory/:partId', () => {
  it('deletes the part (cascades its transactions)', async () => {
    const res = await request(app).delete(`/api/rm-inventory/${testPartId}`).set(writeHeader);
    expect(res.status).toBe(200);
  });

  it('returns 404 on repeat delete', async () => {
    const res = await request(app).delete(`/api/rm-inventory/${testPartId}`).set(writeHeader);
    expect(res.status).toBe(404);
  });
});
