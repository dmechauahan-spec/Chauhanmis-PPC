import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import warehousesRouter from './warehouses.routes';

const app = buildTestApp('/api/warehouses', warehousesRouter);

const testWarehouseId = 'TEST-WH-001';
const secondWarehouseId = 'TEST-WH-002';

// Warehouses write access is Admin-only (master data), same convention as
// Lines/Machines — see README "FG Module Part 1".
let adminHeader: { Authorization: string };
let readHeader: { Authorization: string };

beforeAll(async () => {
  adminHeader = await getAuthHeader(UserRole.Admin);
  readHeader = await getAuthHeader(UserRole.StoreManager);
});

afterAll(async () => {
  await prisma.warehouse.deleteMany({ where: { warehouseId: { in: [testWarehouseId, secondWarehouseId] } } });
  await prisma.$disconnect();
});

describe('POST /api/warehouses', () => {
  it('creates a warehouse, defaulting isActive to true', async () => {
    const res = await request(app).post('/api/warehouses').set(adminHeader).send({
      warehouseId: testWarehouseId,
      warehouseName: 'Test Warehouse 1',
      location: 'Bay A',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.warehouseId).toBe(testWarehouseId);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.location).toBe('Bay A');
  });

  it('creates a warehouse without a location', async () => {
    const res = await request(app).post('/api/warehouses').set(adminHeader).send({
      warehouseId: secondWarehouseId,
      warehouseName: 'Test Warehouse 2',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.location).toBeNull();
  });

  it('rejects a duplicate warehouseId (via the generic P2002 handler, same as testingPlans)', async () => {
    const res = await request(app).post('/api/warehouses').set(adminHeader).send({
      warehouseId: testWarehouseId,
      warehouseName: 'Duplicate',
    });
    expect(res.status).toBe(409);
  });

  it('rejects a StoreManager (not Admin) with 403', async () => {
    const res = await request(app).post('/api/warehouses').set(readHeader).send({
      warehouseId: 'TEST-WH-FORBIDDEN',
      warehouseName: 'Forbidden',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/warehouses').send({
      warehouseId: 'TEST-WH-NOAUTH',
      warehouseName: 'No Auth',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/warehouses', () => {
  it('lists warehouses, readable by StoreManager', async () => {
    const res = await request(app).get('/api/warehouses').set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((w: { warehouseId: string }) => w.warehouseId === testWarehouseId)).toBe(true);
  });

  it('filters by isActive', async () => {
    await request(app).patch(`/api/warehouses/${secondWarehouseId}`).set(adminHeader).send({ isActive: false });

    const res = await request(app).get('/api/warehouses').set(readHeader).query({ isActive: 'false' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((w: { isActive: boolean }) => w.isActive === false)).toBe(true);
    expect(res.body.data.items.some((w: { warehouseId: string }) => w.warehouseId === secondWarehouseId)).toBe(true);
  });
});

describe('GET /api/warehouses/:warehouseId', () => {
  it('returns the warehouse', async () => {
    const res = await request(app).get(`/api/warehouses/${testWarehouseId}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.warehouseId).toBe(testWarehouseId);
  });

  it('returns 404 for an unknown warehouseId', async () => {
    const res = await request(app).get('/api/warehouses/DOES-NOT-EXIST').set(readHeader);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/warehouses/:warehouseId', () => {
  it('updates fields', async () => {
    const res = await request(app)
      .patch(`/api/warehouses/${testWarehouseId}`)
      .set(adminHeader)
      .send({ location: 'Bay B' });

    expect(res.status).toBe(200);
    expect(res.body.data.location).toBe('Bay B');
  });

  it('rejects an update with no fields', async () => {
    const res = await request(app).patch(`/api/warehouses/${testWarehouseId}`).set(adminHeader).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when updating an unknown warehouseId', async () => {
    const res = await request(app).patch('/api/warehouses/DOES-NOT-EXIST').set(adminHeader).send({ location: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects a StoreManager (not Admin) with 403', async () => {
    const res = await request(app)
      .patch(`/api/warehouses/${testWarehouseId}`)
      .set(readHeader)
      .send({ location: 'nope' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/warehouses/:warehouseId', () => {
  it('deletes the warehouse', async () => {
    const res = await request(app).delete(`/api/warehouses/${secondWarehouseId}`).set(adminHeader);
    expect(res.status).toBe(200);
  });

  it('returns 404 on repeat delete', async () => {
    const res = await request(app).delete(`/api/warehouses/${secondWarehouseId}`).set(adminHeader);
    expect(res.status).toBe(404);
  });
});
