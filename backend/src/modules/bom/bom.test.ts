import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import bomRouter from './bom.routes';

const app = buildTestApp('/api/bom', bomRouter);

const testSku = 'TEST-SKU-BOM-001';
const testModelId = 'TEST-MDL-BOM-001';
const testPartId = 'TEST-PART-BOM-001';
let createdId: string;

let writeHeader: { Authorization: string }; // StoreManager
let readOnlyHeader: { Authorization: string }; // ProductionManager

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.StoreManager);
  readOnlyHeader = await getAuthHeader(UserRole.ProductionManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'BOM Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: 40,
      manpowerRequired: 3,
      noOfStations: 4,
    },
  });
  await prisma.rmInventory.create({ data: { partId: testPartId, stock: 100 } });
});

afterAll(async () => {
  await prisma.bomComponent.deleteMany({ where: { modelRef: testSku } });
  await prisma.rmInventory.deleteMany({ where: { partId: testPartId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('POST /api/bom', () => {
  it('creates a BOM row for an existing modelRef and partId', async () => {
    const res = await request(app).post('/api/bom').set(writeHeader).send({
      modelRef: testSku,
      partName: 'Outer fan housing',
      qtyPerUnit: 2,
      partId: testPartId,
      uom: 'Pcs',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.modelRef).toBe(testSku);
    createdId = res.body.data.id;
  });

  it('rejects a payload with an unknown modelRef', async () => {
    const res = await request(app).post('/api/bom').set(writeHeader).send({
      modelRef: 'DOES-NOT-EXIST',
      partName: 'Ghost part',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a payload with an unknown partId', async () => {
    const res = await request(app).post('/api/bom').set(writeHeader).send({
      modelRef: testSku,
      partName: 'Another part',
      partId: 'DOES-NOT-EXIST',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a ProductionManager (not StoreManager) with 403', async () => {
    const res = await request(app).post('/api/bom').set(readOnlyHeader).send({
      modelRef: testSku,
      partName: 'Forbidden part',
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/bom/model/:modelRef', () => {
  it('returns the exploded parts list', async () => {
    const res = await request(app).get(`/api/bom/model/${testSku}`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('returns 400 for an unknown modelRef', async () => {
    const res = await request(app).get('/api/bom/model/DOES-NOT-EXIST').set(readOnlyHeader);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/bom/:id', () => {
  it('updates qtyPerUnit', async () => {
    const res = await request(app).patch(`/api/bom/${createdId}`).set(writeHeader).send({ qtyPerUnit: 3 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.qtyPerUnit)).toBe(3);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/api/bom/999999999').set(writeHeader).send({ qtyPerUnit: 1 });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/bom/bulk', () => {
  it('imports multiple rows in one transaction', async () => {
    const res = await request(app)
      .post('/api/bom/bulk')
      .set(writeHeader)
      .send({
        modelRef: testSku,
        items: [
          { partName: 'Bulk part A', qtyPerUnit: 1 },
          { partName: 'Bulk part B', qtyPerUnit: 2 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects bulk import with an unknown modelRef', async () => {
    const res = await request(app)
      .post('/api/bom/bulk')
      .set(writeHeader)
      .send({ modelRef: 'DOES-NOT-EXIST', items: [{ partName: 'X' }] });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/bom/:id', () => {
  it('deletes the BOM row', async () => {
    const res = await request(app).delete(`/api/bom/${createdId}`).set(writeHeader);
    expect(res.status).toBe(200);
  });
});
