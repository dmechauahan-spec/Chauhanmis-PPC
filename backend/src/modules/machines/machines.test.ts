import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import machinesRouter from './machines.routes';

const app = buildTestApp('/api/machines', machinesRouter);

const testLineId = 'TEST-LINE-MACHINES-001';
const testMachineId = 'TEST-M-001';
const secondMachineId = 'TEST-M-002';

// Machines write access is Admin-only (physical equipment config), same
// reasoning as Lines — see README.
let adminHeader: { Authorization: string };
let readHeader: { Authorization: string };

beforeAll(async () => {
  adminHeader = await getAuthHeader(UserRole.Admin);
  readHeader = await getAuthHeader(UserRole.ProductionManager);

  await prisma.productionLine.create({
    data: {
      lineId: testLineId,
      lineName: 'Machines Test Line',
      maxWorkers: 10,
      efficiencyPct: 80,
    },
  });
});

afterAll(async () => {
  await prisma.machine.deleteMany({ where: { lineId: testLineId } });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.$disconnect();
});

describe('POST /api/machines', () => {
  it('creates a machine with a single capacity field and returns the parent line info', async () => {
    const res = await request(app).post('/api/machines').set(adminHeader).send({
      machineId: testMachineId,
      machineName: 'Test Machine 1',
      lineId: testLineId,
      capacityPerHour: 120,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.machineId).toBe(testMachineId);
    expect(res.body.data.status).toBe('Active');
    expect(res.body.data.line).toEqual({ lineId: testLineId, lineName: 'Machines Test Line' });
  });

  it('accepts more than one capacity field without reconciling them', async () => {
    const res = await request(app).post('/api/machines').set(adminHeader).send({
      machineId: secondMachineId,
      machineName: 'Test Machine 2',
      lineId: testLineId,
      capacityPerHour: 100,
      capacityPerShift: 750,
      capacityPerDay: 2200,
    });

    expect(res.status).toBe(201);
    expect(Number(res.body.data.capacityPerHour)).toBe(100);
    expect(Number(res.body.data.capacityPerShift)).toBe(750);
    expect(Number(res.body.data.capacityPerDay)).toBe(2200);
  });

  it('rejects a payload with no capacity field at all', async () => {
    const res = await request(app).post('/api/machines').set(adminHeader).send({
      machineId: 'TEST-M-NOCAP',
      machineName: 'No Capacity',
      lineId: testLineId,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown lineId', async () => {
    const res = await request(app).post('/api/machines').set(adminHeader).send({
      machineId: 'TEST-M-BADLINE',
      machineName: 'Bad Line',
      lineId: 'DOES-NOT-EXIST',
      capacityPerHour: 50,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a ProductionManager (not Admin) with 403', async () => {
    const res = await request(app).post('/api/machines').set(readHeader).send({
      machineId: 'TEST-M-FORBIDDEN',
      machineName: 'Forbidden',
      lineId: testLineId,
      capacityPerHour: 50,
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/machines').send({
      machineId: 'TEST-M-NOAUTH',
      machineName: 'No Auth',
      lineId: testLineId,
      capacityPerHour: 50,
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/machines', () => {
  it('lists machines, readable by ProductionManager', async () => {
    const res = await request(app).get('/api/machines').set(readHeader).query({ lineId: testLineId });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((m: { machineId: string }) => m.machineId === testMachineId)).toBe(true);
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/machines').set(readHeader).query({ status: 'Active', lineId: testLineId });
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((m: { status: string }) => m.status === 'Active')).toBe(true);
  });
});

describe('GET /api/machines/:machineId', () => {
  it('returns the machine with line info included', async () => {
    const res = await request(app).get(`/api/machines/${testMachineId}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.line.lineId).toBe(testLineId);
  });

  it('returns 404 for unknown machine', async () => {
    const res = await request(app).get('/api/machines/DOES-NOT-EXIST').set(readHeader);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/machines/:machineId', () => {
  it('updates fields', async () => {
    const res = await request(app)
      .patch(`/api/machines/${testMachineId}`)
      .set(adminHeader)
      .send({ status: 'Maintenance', notes: 'Scheduled service' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Maintenance');
    expect(res.body.data.notes).toBe('Scheduled service');
  });

  it('rejects nulling out all three capacity fields in one request', async () => {
    const res = await request(app)
      .patch(`/api/machines/${testMachineId}`)
      .set(adminHeader)
      .send({ capacityPerHour: null, capacityPerShift: null, capacityPerDay: null });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown lineId', async () => {
    const res = await request(app)
      .patch(`/api/machines/${testMachineId}`)
      .set(adminHeader)
      .send({ lineId: 'DOES-NOT-EXIST' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown machine', async () => {
    const res = await request(app).patch('/api/machines/DOES-NOT-EXIST').set(adminHeader).send({ notes: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects a ProductionManager (not Admin) with 403', async () => {
    const res = await request(app)
      .patch(`/api/machines/${testMachineId}`)
      .set(readHeader)
      .send({ notes: 'nope' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/machines/:machineId', () => {
  it('deletes the machine', async () => {
    const res = await request(app).delete(`/api/machines/${secondMachineId}`).set(adminHeader);
    expect(res.status).toBe(200);
  });

  it('returns 404 on repeat delete', async () => {
    const res = await request(app).delete(`/api/machines/${secondMachineId}`).set(adminHeader);
    expect(res.status).toBe(404);
  });
});
