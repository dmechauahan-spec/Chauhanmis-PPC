import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { createTestUserWithAuthHeader, getAuthHeader } from '../../testUtils/auth';
import dailyLogsRouter from './dailyLogs.routes';

const app = buildTestApp('/api/daily-logs', dailyLogsRouter);

const testLineId = 'TEST-LINE-DLOG-001';
const testModelId = 'TEST-MDL-DLOG-001';
const testSku = 'TEST-SKU-DLOG-001';
const testOrderId = 'TEST-SO-DLOG-001';

// Distinctive, far-future dates so repeat test runs never collide with real
// usage and the log_id sequence is guaranteed to start fresh each time.
const SEQ_DATE = '2031-03-15';
const OTHER_DATE = '2031-03-16';
const ROLLBACK_DATE = '2031-03-17';
const oldEditWindowLogId = 'TEST-DL-OLD-001';

// ProductionManager satisfies both read and write access for this module —
// used for every request below except the two dedicated role-enforcement
// tests, which use a StoreManager header (read-only here) instead.
let writeHeader: { Authorization: string };
let writeUserName: string;
let readOnlyHeader: { Authorization: string };

async function deleteLogsForDateStamp(dateStamp: string) {
  const prefix = `DL-${dateStamp}-`;
  const rows = await prisma.dailyProductionLog.findMany({
    where: { logId: { startsWith: prefix } },
    select: { logId: true },
  });
  await prisma.downtimeLog.deleteMany({ where: { logId: { in: rows.map((r) => r.logId) } } });
  await prisma.dailyProductionLog.deleteMany({ where: { logId: { startsWith: prefix } } });
}

beforeAll(async () => {
  const { user, authHeader } = await createTestUserWithAuthHeader(UserRole.ProductionManager);
  writeHeader = authHeader;
  writeUserName = user.name;
  readOnlyHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'Daily Log Test Line', maxWorkers: 30, efficiencyPct: 85 },
  });
  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Daily Log Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: 40,
      manpowerRequired: 4,
      noOfStations: 5,
    },
  });
  await prisma.order.create({
    data: { orderId: testOrderId, client: 'Daily Log Test Client', sku: testSku, product: 'OTG', qty: 50 },
  });
});

afterAll(async () => {
  await prisma.downtimeLog.deleteMany({ where: { logId: oldEditWindowLogId } });
  await prisma.dailyProductionLog.deleteMany({ where: { logId: oldEditWindowLogId } });
  await deleteLogsForDateStamp('20310315');
  await deleteLogsForDateStamp('20310316');
  await deleteLogsForDateStamp('20310317');
  await prisma.order.deleteMany({ where: { orderId: testOrderId } });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('POST /api/daily-logs — log_id sequence generation', () => {
  it('assigns -01 then -02 for two logs on the same date', async () => {
    const res1 = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE });
    expect(res1.status).toBe(201);
    expect(res1.body.data.logId).toBe('DL-20310315-01');
    // savedBy is derived server-side from the authenticated caller, never
    // from a client-supplied value in the request body.
    expect(res1.body.data.savedBy).toBe(writeUserName);

    const res2 = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE });
    expect(res2.status).toBe(201);
    expect(res2.body.data.logId).toBe('DL-20310315-02');
  });

  it('resets the sequence to -01 on a different date', async () => {
    const res = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: OTHER_DATE });
    expect(res.status).toBe(201);
    expect(res.body.data.logId).toBe('DL-20310316-01');
  });
});

describe('POST /api/daily-logs — validation', () => {
  it('rejects an unknown lineId', async () => {
    const res = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, lineId: 'DOES-NOT-EXIST' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown modelId', async () => {
    const res = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, modelId: 'DOES-NOT-EXIST' });
    expect(res.status).toBe(400);
  });

  it('rejects presentEmployees > totalEmployees', async () => {
    const res = await request(app).post('/api/daily-logs').set(writeHeader).send({
      logDate: SEQ_DATE,
      totalEmployees: 10,
      presentEmployees: 15,
    });
    expect(res.status).toBe(400);
  });

  it('always computes absentEmployees / attendancePct server-side, ignoring any client override', async () => {
    const res = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({
        logDate: SEQ_DATE,
        lineId: testLineId,
        modelId: testModelId,
        totalEmployees: 20,
        presentEmployees: 18,
        absentEmployees: 999,
        attendancePct: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.absentEmployees).toBe(2);
    expect(Number(res.body.data.attendancePct)).toBe(90);
    expect(res.body.data.lineName).toBe('Daily Log Test Line');
    expect(res.body.data.modelName).toBe('Daily Log Test Model');
  });

  it('stores attendancePct as null when totalEmployees is 0', async () => {
    const res = await request(app).post('/api/daily-logs').set(writeHeader).send({
      logDate: SEQ_DATE,
      totalEmployees: 0,
      presentEmployees: 0,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.attendancePct).toBeNull();
    expect(res.body.data.absentEmployees).toBe(0);
  });

  it("rejects a downtime entry with reason 'Other' and no notes", async () => {
    const res = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({
        logDate: SEQ_DATE,
        downtimeEntries: [{ reason: 'Other', minutes: 15 }],
      });
    expect(res.status).toBe(400);
  });

  it('rejects goodQty greater than totalOutputQty', async () => {
    const res = await request(app).post('/api/daily-logs').set(writeHeader).send({
      logDate: SEQ_DATE,
      totalOutputQty: 100,
      goodQty: 150,
    });
    expect(res.status).toBe(400);
  });

  it('defaults plannedMinutes from the shift lookup when omitted (Module 4)', async () => {
    const generalRes = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, shift: 'General' });
    expect(Number(generalRes.body.data.plannedMinutes)).toBe(480);

    const extendedRes = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, shift: 'Full+Extended' });
    expect(Number(extendedRes.body.data.plannedMinutes)).toBe(600);

    const unknownShiftRes = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, shift: 'Some Unrecognized Shift' });
    expect(Number(unknownShiftRes.body.data.plannedMinutes)).toBe(480);

    const explicitRes = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, shift: 'General', plannedMinutes: 400 });
    expect(Number(explicitRes.body.data.plannedMinutes)).toBe(400);
  });

  it('accepts a nested downtimeEntries array and creates the rows transactionally', async () => {
    const res = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({
        logDate: SEQ_DATE,
        downtimeEntries: [
          { reason: 'Machine Breakdown', minutes: 30 },
          { reason: 'Other', minutes: 10, notes: 'Unexplained stoppage' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.downtimeEntries).toHaveLength(2);
  });

  it('rejects a StoreManager (not ProductionManager) with 403', async () => {
    const res = await request(app)
      .post('/api/daily-logs')
      .set(readOnlyHeader)
      .send({ logDate: SEQ_DATE });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/daily-logs').send({ logDate: SEQ_DATE });
    expect(res.status).toBe(401);
  });
});

describe('orderId / rejectedQty / reworkQty (Client Flow Part 1)', () => {
  it('accepts a valid orderId, rejectedQty and reworkQty on create', async () => {
    const res = await request(app).post('/api/daily-logs').set(writeHeader).send({
      logDate: SEQ_DATE,
      orderId: testOrderId,
      rejectedQty: 5,
      reworkQty: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.orderId).toBe(testOrderId);
    expect(Number(res.body.data.rejectedQty)).toBe(5);
    expect(Number(res.body.data.reworkQty)).toBe(3);
  });

  it('rejects an unknown orderId on create with a clear error', async () => {
    const res = await request(app).post('/api/daily-logs').set(writeHeader).send({
      logDate: SEQ_DATE,
      orderId: 'DOES-NOT-EXIST',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid orderId/);
  });

  it('creates a log with no orderId (still optional/nullable)', async () => {
    const res = await request(app).post('/api/daily-logs').set(writeHeader).send({ logDate: SEQ_DATE });
    expect(res.status).toBe(201);
    expect(res.body.data.orderId).toBeNull();
  });

  it('accepts a valid orderId via PATCH, and rejects an unknown one', async () => {
    const created = await request(app).post('/api/daily-logs').set(writeHeader).send({ logDate: SEQ_DATE });
    const logId = created.body.data.logId;

    const okRes = await request(app)
      .patch(`/api/daily-logs/${logId}`)
      .set(writeHeader)
      .send({ orderId: testOrderId, rejectedQty: 2, reworkQty: 1 });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.orderId).toBe(testOrderId);
    expect(Number(okRes.body.data.rejectedQty)).toBe(2);
    expect(Number(okRes.body.data.reworkQty)).toBe(1);

    const badRes = await request(app)
      .patch(`/api/daily-logs/${logId}`)
      .set(writeHeader)
      .send({ orderId: 'DOES-NOT-EXIST' });
    expect(badRes.status).toBe(400);
  });
});

describe('GET /api/daily-logs', () => {
  it('filters by lineId and date range', async () => {
    const res = await request(app)
      .get('/api/daily-logs')
      .set(readOnlyHeader)
      .query({ lineId: testLineId, dateFrom: SEQ_DATE, dateTo: SEQ_DATE });

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((l: { lineId: string }) => l.lineId === testLineId)).toBe(true);
  });
});

describe('GET /api/daily-logs/:logId', () => {
  it('returns stationAssignments and downtimeEntries', async () => {
    const created = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({
        logDate: SEQ_DATE,
        stationAssignments: { Element: ['ajit', 'suresh'], Pully: ['karan', 'arjun'] },
      });

    const res = await request(app).get(`/api/daily-logs/${created.body.data.logId}`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.stationAssignments).toEqual({
      Element: ['ajit', 'suresh'],
      Pully: ['karan', 'arjun'],
    });
    expect(Array.isArray(res.body.data.downtimeEntries)).toBe(true);
  });

  it('returns 404 for an unknown logId', async () => {
    const res = await request(app).get('/api/daily-logs/DOES-NOT-EXIST').set(readOnlyHeader);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/daily-logs/:logId', () => {
  it('recomputes absentEmployees / attendancePct when presentEmployees changes', async () => {
    const created = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, totalEmployees: 20, presentEmployees: 20 });

    const res = await request(app)
      .patch(`/api/daily-logs/${created.body.data.logId}`)
      .set(writeHeader)
      .send({ presentEmployees: 15 });

    expect(res.status).toBe(200);
    expect(res.body.data.absentEmployees).toBe(5);
    expect(Number(res.body.data.attendancePct)).toBe(75);
    // A PATCH re-stamps savedBy with whoever made this edit, not the original creator.
    expect(res.body.data.savedBy).toBe(writeUserName);
  });

  it('rejects editing a log dated more than the edit window in the past', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 5);
    await prisma.dailyProductionLog.create({
      data: { logId: oldEditWindowLogId, logDate: oldDate, savedBy: 'fixture' },
    });

    const res = await request(app)
      .patch(`/api/daily-logs/${oldEditWindowLogId}`)
      .set(writeHeader)
      .send({ notes: 'trying to edit history' });

    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown logId', async () => {
    const res = await request(app).patch('/api/daily-logs/DOES-NOT-EXIST').set(writeHeader).send({ notes: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects goodQty greater than totalOutputQty using the merged existing+patch values', async () => {
    const created = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, totalOutputQty: 100, goodQty: 90 });

    const res = await request(app)
      .patch(`/api/daily-logs/${created.body.data.logId}`)
      .set(writeHeader)
      .send({ goodQty: 150 });

    expect(res.status).toBe(400);
  });

  it('does not overwrite an already-set plannedMinutes on an unrelated PATCH', async () => {
    const created = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE, shift: 'General', plannedMinutes: 555 });

    const res = await request(app)
      .patch(`/api/daily-logs/${created.body.data.logId}`)
      .set(writeHeader)
      .send({ notes: 'unrelated edit' });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.plannedMinutes)).toBe(555);
  });
});

describe('Downtime sub-resource endpoints', () => {
  let logId: string;

  beforeAll(async () => {
    const created = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({ logDate: SEQ_DATE });
    logId = created.body.data.logId;
  });

  it('adds a downtime entry', async () => {
    const res = await request(app)
      .post(`/api/daily-logs/${logId}/downtime`)
      .set(writeHeader)
      .send({ reason: 'Power Failure', minutes: 45 });
    expect(res.status).toBe(201);
    expect(res.body.data.reason).toBe('Power Failure');
  });

  it('lists downtime entries for the log', async () => {
    const res = await request(app).get(`/api/daily-logs/${logId}/downtime`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a downtime entry', async () => {
    const listRes = await request(app).get(`/api/daily-logs/${logId}/downtime`).set(readOnlyHeader);
    const downtimeId = listRes.body.data[0].id;

    const res = await request(app).delete(`/api/daily-logs/${logId}/downtime/${downtimeId}`).set(writeHeader);
    expect(res.status).toBe(200);
  });

  it('returns 404 deleting an unknown downtime entry', async () => {
    const res = await request(app).delete(`/api/daily-logs/${logId}/downtime/999999999`).set(writeHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/daily-logs/summary/downtime-by-reason', () => {
  it('returns totals grouped by reason', async () => {
    const res = await request(app)
      .get('/api/daily-logs/summary/downtime-by-reason')
      .set(readOnlyHeader)
      .query({ dateFrom: SEQ_DATE, dateTo: SEQ_DATE });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const reasons = res.body.data.map((r: { reason: string }) => r.reason);
    expect(reasons).toContain('Machine Breakdown');
  });
});

describe('Transactional atomicity of nested downtime create', () => {
  it('rolls back the daily log row if a nested downtime insert fails', async () => {
    const expectedLogId = 'DL-20310317-01';

    const res = await request(app)
      .post('/api/daily-logs')
      .set(writeHeader)
      .send({
        logDate: ROLLBACK_DATE,
        downtimeEntries: [
          // Exceeds Decimal(10,2) precision -> Postgres numeric field overflow,
          // thrown *after* the daily log row insert already ran in the same tx.
          { reason: 'Machine Breakdown', minutes: 999999999999 },
        ],
      });

    expect(res.status).toBe(500);

    const log = await prisma.dailyProductionLog.findUnique({ where: { logId: expectedLogId } });
    expect(log).toBeNull();
  });
});
