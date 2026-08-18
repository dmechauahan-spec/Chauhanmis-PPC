import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import productsRouter from './products.routes';

const app = buildTestApp('/api/products', productsRouter);

const testModelId = 'TEST-MDL-PRODUCTS-001';
const testSku = 'TEST-SKU-PRODUCTS-001';
const testPlywoodModelId = 'TEST-MDL-PRODUCTS-PLY-001';
const testPlywoodSku = 'TEST-SKU-PRODUCTS-PLY-001';

// Products write access is Admin-only; read is StoreManager/ProductionManager.
let adminHeader: { Authorization: string };
let readHeader: { Authorization: string };

beforeAll(async () => {
  adminHeader = await getAuthHeader(UserRole.Admin);
  readHeader = await getAuthHeader(UserRole.StoreManager);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { modelId: { in: [testModelId, testPlywoodModelId] } } });
  await prisma.$disconnect();
});

describe('POST /api/products', () => {
  it('creates a product with valid payload', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(adminHeader)
      .send({
        modelId: testModelId,
        modelName: 'Test Model',
        productType: 'OTG',
        sku: testSku,
        taktTimeSec: 45.5,
        manpowerRequired: 4,
        noOfStations: 6,
        changeoverTimeMin: 10,
        notes: 'created by test',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modelId).toBe(testModelId);
    expect(res.body.data.sku).toBe(testSku);
  });

  it('rejects a payload with taktTimeSec <= 0', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(adminHeader)
      .send({
        modelId: 'TEST-MDL-INVALID',
        modelName: 'Invalid Model',
        productType: 'OTG',
        sku: 'TEST-SKU-INVALID',
        taktTimeSec: 0,
        manpowerRequired: 4,
        noOfStations: 6,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Validation failed');
  });

  it('rejects a non-Admin (StoreManager) with 403', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(readHeader)
      .send({
        modelId: 'TEST-MDL-FORBIDDEN',
        modelName: 'Forbidden',
        productType: 'OTG',
        sku: 'TEST-SKU-FORBIDDEN',
        taktTimeSec: 10,
        manpowerRequired: 1,
        noOfStations: 1,
      });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/products').send({
      modelId: 'TEST-MDL-NOAUTH',
      modelName: 'No Auth',
      productType: 'OTG',
      sku: 'TEST-SKU-NOAUTH',
      taktTimeSec: 10,
      manpowerRequired: 1,
      noOfStations: 1,
    });
    expect(res.status).toBe(401);
  });
});

describe('POST/PATCH /api/products — plywood attributes (FG Module Part 1)', () => {
  it('creates a product with plywood attributes and round-trips them', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(adminHeader)
      .send({
        modelId: testPlywoodModelId,
        modelName: 'Test Plywood Sheet',
        productType: 'Plywood',
        sku: testPlywoodSku,
        taktTimeSec: 20,
        manpowerRequired: 2,
        noOfStations: 2,
        plywoodGrade: 'BWP',
        thickness: 18,
        sheetLength: 2440,
        sheetWidth: 1220,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.plywoodGrade).toBe('BWP');
    expect(Number(res.body.data.thickness)).toBe(18);
    expect(Number(res.body.data.sheetLength)).toBe(2440);
    expect(Number(res.body.data.sheetWidth)).toBe(1220);
  });

  it('creates a non-plywood product with the plywood fields left null (existing behavior unaffected)', async () => {
    const res = await request(app)
      .get(`/api/products/${testModelId}`)
      .set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.plywoodGrade).toBeNull();
    expect(res.body.data.thickness).toBeNull();
    expect(res.body.data.sheetLength).toBeNull();
    expect(res.body.data.sheetWidth).toBeNull();
  });

  it('rejects an invalid plywoodGrade', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(adminHeader)
      .send({
        modelId: 'TEST-MDL-PRODUCTS-PLY-BAD',
        modelName: 'Bad Grade',
        productType: 'Plywood',
        sku: 'TEST-SKU-PRODUCTS-PLY-BAD',
        taktTimeSec: 20,
        manpowerRequired: 2,
        noOfStations: 2,
        plywoodGrade: 'NotAGrade',
      });
    expect(res.status).toBe(400);
  });

  it('updates plywood attributes on an existing product', async () => {
    const res = await request(app)
      .patch(`/api/products/${testPlywoodModelId}`)
      .set(adminHeader)
      .send({ plywoodGrade: 'MR', thickness: 12 });

    expect(res.status).toBe(200);
    expect(res.body.data.plywoodGrade).toBe('MR');
    expect(Number(res.body.data.thickness)).toBe(12);
    // Untouched fields survive the partial update unchanged.
    expect(Number(res.body.data.sheetLength)).toBe(2440);
  });

  it('clears a plywood attribute by explicitly setting it to null', async () => {
    const res = await request(app)
      .patch(`/api/products/${testPlywoodModelId}`)
      .set(adminHeader)
      .send({ plywoodGrade: null });

    expect(res.status).toBe(200);
    expect(res.body.data.plywoodGrade).toBeNull();
  });
});

describe('GET /api/products', () => {
  it('lists products with pagination envelope', async () => {
    const res = await request(app).get('/api/products').set(readHeader).query({ page: 1, pageSize: 10 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(10);
  });

  it('filters by productType and search', async () => {
    const res = await request(app)
      .get('/api/products')
      .set(readHeader)
      .query({ productType: 'OTG', search: 'Test Model' });

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((p: { modelId: string }) => p.modelId === testModelId)).toBe(true);
  });
});

describe('GET /api/products/:modelId', () => {
  it('returns the product', async () => {
    const res = await request(app).get(`/api/products/${testModelId}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.modelId).toBe(testModelId);
  });

  it('returns 404 for an unknown modelId', async () => {
    const res = await request(app).get('/api/products/DOES-NOT-EXIST').set(readHeader);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/products/:modelId', () => {
  it('updates allowed fields', async () => {
    const res = await request(app)
      .patch(`/api/products/${testModelId}`)
      .set(adminHeader)
      .send({ notes: 'updated by test', manpowerRequired: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe('updated by test');
    expect(res.body.data.manpowerRequired).toBe(5);
  });

  it('rejects an update with no fields', async () => {
    const res = await request(app).patch(`/api/products/${testModelId}`).set(adminHeader).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when updating an unknown modelId', async () => {
    const res = await request(app).patch('/api/products/DOES-NOT-EXIST').set(adminHeader).send({ notes: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/products/:modelId', () => {
  it('deletes the product', async () => {
    const res = await request(app).delete(`/api/products/${testModelId}`).set(adminHeader);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when deleting again', async () => {
    const res = await request(app).delete(`/api/products/${testModelId}`).set(adminHeader);
    expect(res.status).toBe(404);
  });
});
