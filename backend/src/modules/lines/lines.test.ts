import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import linesRouter from './lines.routes';

const app = buildTestApp('/api/lines', linesRouter);

const testLineId = 'TEST-LINE-001';

// Lines write access is Admin-only (physical line config) even though
// ProductionManager works with lines operationally every day — see README.
let adminHeader: { Authorization: string };
let readHeader: { Authorization: string };

beforeAll(async () => {
  adminHeader = await getAuthHeader(UserRole.Admin);
  readHeader = await getAuthHeader(UserRole.ProductionManager);
});

afterAll(async () => {
  await prisma.lineProductCompatibility.deleteMany({ where: { lineId: testLineId } });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.$disconnect();
});

describe('POST /api/lines', () => {
  it('creates a line with compatible product types', async () => {
    const res = await request(app)
      .post('/api/lines')
      .set(adminHeader)
      .send({
        lineId: testLineId,
        lineName: 'Test Line 1',
        maxWorkers: 20,
        efficiencyPct: 85.5,
        productTypes: ['OTG', 'Air Fryer'],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.lineId).toBe(testLineId);
    expect(res.body.data.productTypes.sort()).toEqual(['Air Fryer', 'OTG']);
  });

  it('rejects a payload with maxWorkers <= 0', async () => {
    const res = await request(app).post('/api/lines').set(adminHeader).send({
      lineId: 'TEST-LINE-INVALID',
      lineName: 'Invalid',
      maxWorkers: 0,
      efficiencyPct: 50,
    });

    expect(res.status).toBe(400);
  });

  it('rejects a ProductionManager (not Admin) with 403', async () => {
    const res = await request(app).post('/api/lines').set(readHeader).send({
      lineId: 'TEST-LINE-FORBIDDEN',
      lineName: 'Forbidden',
      maxWorkers: 5,
      efficiencyPct: 50,
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/lines/:lineId', () => {
  it('returns the line with productTypes included', async () => {
    const res = await request(app).get(`/api/lines/${testLineId}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.productTypes).toContain('OTG');
  });

  it('returns 404 for unknown line', async () => {
    const res = await request(app).get('/api/lines/DOES-NOT-EXIST').set(readHeader);
    expect(res.status).toBe(404);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/lines/${testLineId}`);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/lines/:lineId', () => {
  it('syncs productTypes to a new set', async () => {
    const res = await request(app)
      .patch(`/api/lines/${testLineId}`)
      .set(adminHeader)
      .send({ productTypes: ['Air Fryer Oven'] });

    expect(res.status).toBe(200);
    expect(res.body.data.productTypes).toEqual(['Air Fryer Oven']);
  });

  it('returns 404 for unknown line', async () => {
    const res = await request(app).patch('/api/lines/DOES-NOT-EXIST').set(adminHeader).send({ maxWorkers: 5 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/lines/:lineId', () => {
  it('deletes the line', async () => {
    const res = await request(app).delete(`/api/lines/${testLineId}`).set(adminHeader);
    expect(res.status).toBe(200);
  });

  it('returns 404 on repeat delete', async () => {
    const res = await request(app).delete(`/api/lines/${testLineId}`).set(adminHeader);
    expect(res.status).toBe(404);
  });
});
