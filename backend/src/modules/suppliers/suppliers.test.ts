import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import suppliersRouter from './suppliers.routes';

const app = buildTestApp('/api/suppliers', suppliersRouter);

const testSupplierCode = 'TEST-SUP-001';
const secondSupplierCode = 'TEST-SUP-002';

// Suppliers write access is Admin-only (master data), same convention as
// Warehouses/Machines/Lines — see README "Purchase Module Part 1".
let adminHeader: { Authorization: string };
let readHeader: { Authorization: string };

beforeAll(async () => {
  adminHeader = await getAuthHeader(UserRole.Admin);
  readHeader = await getAuthHeader(UserRole.StoreManager);
});

afterAll(async () => {
  await prisma.supplier.deleteMany({ where: { supplierCode: { in: [testSupplierCode, secondSupplierCode] } } });
  await prisma.$disconnect();
});

describe('POST /api/suppliers', () => {
  it('creates a supplier, defaulting isActive to true', async () => {
    const res = await request(app).post('/api/suppliers').set(adminHeader).send({
      supplierCode: testSupplierCode,
      supplierName: 'Test Supplier 1',
      gstNumber: '27AAAAA0000A1Z5',
      email: 'supplier1@example.com',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.supplierCode).toBe(testSupplierCode);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.gstNumber).toBe('27AAAAA0000A1Z5');
  });

  it('creates a supplier with only the required fields', async () => {
    const res = await request(app).post('/api/suppliers').set(adminHeader).send({
      supplierCode: secondSupplierCode,
      supplierName: 'Test Supplier 2',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.gstNumber).toBeNull();
  });

  it('rejects a duplicate supplierCode', async () => {
    const res = await request(app).post('/api/suppliers').set(adminHeader).send({
      supplierCode: testSupplierCode,
      supplierName: 'Duplicate',
    });
    expect(res.status).toBe(409);
  });

  it('rejects a StoreManager (not Admin) with 403', async () => {
    const res = await request(app).post('/api/suppliers').set(readHeader).send({
      supplierCode: 'TEST-SUP-FORBIDDEN',
      supplierName: 'Forbidden',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/suppliers').send({
      supplierCode: 'TEST-SUP-NOAUTH',
      supplierName: 'No Auth',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/suppliers', () => {
  it('lists suppliers, readable by StoreManager', async () => {
    const res = await request(app).get('/api/suppliers').set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((s: { supplierCode: string }) => s.supplierCode === testSupplierCode)).toBe(true);
  });

  it('filters by search across code/name', async () => {
    const res = await request(app).get('/api/suppliers').set(readHeader).query({ search: 'Test Supplier 1' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((s: { supplierCode: string }) => s.supplierCode === testSupplierCode)).toBe(true);
    expect(res.body.data.items.every((s: { supplierCode: string }) => s.supplierCode !== secondSupplierCode)).toBe(
      true,
    );
  });
});

describe('GET /api/suppliers/:code', () => {
  it('returns the supplier', async () => {
    const res = await request(app).get(`/api/suppliers/${testSupplierCode}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.supplierCode).toBe(testSupplierCode);
  });

  it('returns 404 for an unknown supplierCode', async () => {
    const res = await request(app).get('/api/suppliers/DOES-NOT-EXIST').set(readHeader);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/suppliers/:code', () => {
  it('updates fields', async () => {
    const res = await request(app)
      .patch(`/api/suppliers/${testSupplierCode}`)
      .set(adminHeader)
      .send({ contactPerson: 'Mr. Test' });

    expect(res.status).toBe(200);
    expect(res.body.data.contactPerson).toBe('Mr. Test');
  });

  it('rejects an update with no fields', async () => {
    const res = await request(app).patch(`/api/suppliers/${testSupplierCode}`).set(adminHeader).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when updating an unknown supplierCode', async () => {
    const res = await request(app).patch('/api/suppliers/DOES-NOT-EXIST').set(adminHeader).send({ contactPerson: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects a StoreManager (not Admin) with 403', async () => {
    const res = await request(app)
      .patch(`/api/suppliers/${testSupplierCode}`)
      .set(readHeader)
      .send({ contactPerson: 'nope' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/suppliers/:code', () => {
  it('deletes the supplier', async () => {
    const res = await request(app).delete(`/api/suppliers/${secondSupplierCode}`).set(adminHeader);
    expect(res.status).toBe(200);
  });

  it('returns 404 on repeat delete', async () => {
    const res = await request(app).delete(`/api/suppliers/${secondSupplierCode}`).set(adminHeader);
    expect(res.status).toBe(404);
  });
});
