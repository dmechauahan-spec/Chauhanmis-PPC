import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import hrRouter from './hr.routes';

const app = buildTestApp('/api/hr-teams', hrRouter);

const testLineId = 'TEST-LINE-HR-001';
const testTeamId = 'TEST-TEAM-001';

let writeHeader: { Authorization: string }; // ProductionManager
let readOnlyHeader: { Authorization: string }; // StoreManager

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.ProductionManager);
  readOnlyHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'HR Test Line', maxWorkers: 10, efficiencyPct: 90 },
  });
});

afterAll(async () => {
  await prisma.hrTeam.deleteMany({ where: { teamId: testTeamId } });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.$disconnect();
});

describe('POST /api/hr-teams', () => {
  it('creates an HR team with a valid lineId', async () => {
    const res = await request(app).post('/api/hr-teams').set(writeHeader).send({
      teamId: testTeamId,
      teamName: 'Assembly Team',
      lineId: testLineId,
      workers: 12,
      skill: 'Multi-Skill',
      attendancePct: 92.5,
      shift: 'General',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.teamId).toBe(testTeamId);
  });

  it('rejects a payload referencing a non-existent lineId', async () => {
    const res = await request(app).post('/api/hr-teams').set(writeHeader).send({
      teamId: 'TEST-TEAM-BADLINE',
      teamName: 'Bad Team',
      lineId: 'DOES-NOT-EXIST',
      workers: 5,
    });

    expect(res.status).toBe(400);
  });

  it('rejects a StoreManager (not ProductionManager) with 403', async () => {
    const res = await request(app).post('/api/hr-teams').set(readOnlyHeader).send({
      teamId: 'TEST-TEAM-FORBIDDEN',
      teamName: 'Forbidden',
      lineId: testLineId,
      workers: 3,
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/hr-teams', () => {
  it('filters by lineId', async () => {
    const res = await request(app).get('/api/hr-teams').set(readOnlyHeader).query({ lineId: testLineId });
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((t: { lineId: string }) => t.lineId === testLineId)).toBe(true);
  });
});

describe('PATCH /api/hr-teams/:teamId', () => {
  it('rejects update with a non-existent lineId', async () => {
    const res = await request(app)
      .patch(`/api/hr-teams/${testTeamId}`)
      .set(writeHeader)
      .send({ lineId: 'DOES-NOT-EXIST' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown teamId', async () => {
    const res = await request(app).patch('/api/hr-teams/DOES-NOT-EXIST').set(writeHeader).send({ workers: 3 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/hr-teams/:teamId', () => {
  it('deletes the team', async () => {
    const res = await request(app).delete(`/api/hr-teams/${testTeamId}`).set(writeHeader);
    expect(res.status).toBe(200);
  });
});
