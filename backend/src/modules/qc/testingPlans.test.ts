import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import testingPlansRouter from './testingPlans.routes';

const app = buildTestApp('/api/qc/testing-plans', testingPlansRouter);

const testProductType = 'TEST-PRODUCTTYPE-TP-001';
const testProductType2 = 'TEST-PRODUCTTYPE-TP-002';

let adminHeader: { Authorization: string };
let readHeader: { Authorization: string };

beforeAll(async () => {
  adminHeader = await getAuthHeader(UserRole.Admin);
  readHeader = await getAuthHeader(UserRole.StoreManager);
});

afterAll(async () => {
  await prisma.testingPlan.deleteMany({ where: { productType: { in: [testProductType, testProductType2] } } });
  await prisma.$disconnect();
});

describe('POST /api/qc/testing-plans', () => {
  it('creates a testing plan', async () => {
    const res = await request(app)
      .post('/api/qc/testing-plans')
      .set(adminHeader)
      .send({ productType: testProductType, planName: 'Test Plan A', description: 'A description' });
    expect(res.status).toBe(201);
    expect(res.body.data.productType).toBe(testProductType);
  });

  it('rejects a duplicate productType', async () => {
    const res = await request(app)
      .post('/api/qc/testing-plans')
      .set(adminHeader)
      .send({ productType: testProductType, planName: 'Duplicate Attempt' });
    expect(res.status).toBe(409);
  });

  it('rejects a missing planName', async () => {
    const res = await request(app).post('/api/qc/testing-plans').set(adminHeader).send({ productType: testProductType2 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/qc/testing-plans', () => {
  it('lists testing plans, filterable by productType', async () => {
    const res = await request(app).get('/api/qc/testing-plans').set(readHeader).query({ productType: testProductType });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].productType).toBe(testProductType);
  });
});

describe('GET /api/qc/testing-plans/:id', () => {
  it('returns the plan by id', async () => {
    const created = await prisma.testingPlan.findUniqueOrThrow({ where: { productType: testProductType } });
    const res = await request(app).get(`/api/qc/testing-plans/${created.id}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.planName).toBe('Test Plan A');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/qc/testing-plans/999999999').set(readHeader);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/qc/testing-plans/:id', () => {
  it('updates the plan', async () => {
    const created = await prisma.testingPlan.findUniqueOrThrow({ where: { productType: testProductType } });
    const res = await request(app)
      .patch(`/api/qc/testing-plans/${created.id}`)
      .set(adminHeader)
      .send({ planName: 'Updated Plan Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.planName).toBe('Updated Plan Name');
  });

  it('rejects an update with no fields', async () => {
    const created = await prisma.testingPlan.findUniqueOrThrow({ where: { productType: testProductType } });
    const res = await request(app).patch(`/api/qc/testing-plans/${created.id}`).set(adminHeader).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/api/qc/testing-plans/999999999').set(adminHeader).send({ planName: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/qc/testing-plans/:id', () => {
  it('deletes the plan', async () => {
    const created = await prisma.testingPlan.create({ data: { productType: testProductType2, planName: 'To Delete' } });
    const res = await request(app).delete(`/api/qc/testing-plans/${created.id}`).set(adminHeader);
    expect(res.status).toBe(200);

    const after = await prisma.testingPlan.findUnique({ where: { id: created.id } });
    expect(after).toBeNull();
  });

  it('returns 404 on repeat delete', async () => {
    const created = await prisma.testingPlan.findUniqueOrThrow({ where: { productType: testProductType } });
    await request(app).delete(`/api/qc/testing-plans/${created.id}`).set(adminHeader);
    const res = await request(app).delete(`/api/qc/testing-plans/${created.id}`).set(adminHeader);
    expect(res.status).toBe(404);
  });
});
