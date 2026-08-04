import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import oeeRouter from './oee.routes';
import dailyLogsRouter from '../dailyLogs/dailyLogs.routes';

const oeeApp = buildTestApp('/api/oee', oeeRouter);
const dailyLogsApp = buildTestApp('/api/daily-logs', dailyLogsRouter);

// OEE is read-only; StoreManager exercises that read access. Fixture logs
// are created via the (write-protected) daily-logs API, so that needs a
// ProductionManager header.
let readHeader: { Authorization: string };
let dailyLogWriteHeader: { Authorization: string };

const testLineId = 'TEST-LINE-OEE-001';
const testModelId = 'TEST-MDL-OEE-001';
const testSku = 'TEST-SKU-OEE-001';
const TAKT_TIME_SEC = 40;

// Distinctive, far-future dates so repeat runs never collide with real usage
// or with dailyLogs.test.ts's own fixture dates.
const D1 = '2032-05-01'; // fully-populated log
const D2 = '2032-05-02'; // log missing model + output data
const D3 = '2032-05-03'; // small log, for the weighted-aggregation test
const D4 = '2032-05-04'; // large log, for the weighted-aggregation test
const RANGE_START = D1;
const RANGE_END = D4;

let logIdFull: string;
let logIdMissing: string;
let logIdSmall: string;
let logIdBig: string;

async function createLog(body: Record<string, unknown>): Promise<string> {
  const res = await request(dailyLogsApp).post('/api/daily-logs').set(dailyLogWriteHeader).send(body);
  if (res.status !== 201) {
    throw new Error(`fixture creation failed: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.logId as string;
}

beforeAll(async () => {
  readHeader = await getAuthHeader(UserRole.StoreManager);
  dailyLogWriteHeader = await getAuthHeader(UserRole.ProductionManager);

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'OEE Test Line', maxWorkers: 30, efficiencyPct: 85 },
  });
  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'OEE Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: TAKT_TIME_SEC,
      manpowerRequired: 4,
      noOfStations: 5,
    },
  });

  // Fully populated: 480 planned, 60 downtime -> 420 run time, 500 produced, 480 good.
  logIdFull = await createLog({
    logDate: D1,
    shift: 'General',
    lineId: testLineId,
    modelId: testModelId,
    plannedMinutes: 480,
    totalOutputQty: 500,
    goodQty: 480,
    downtimeEntries: [{ reason: 'Machine Breakdown', minutes: 60 }],
  });

  // No model linked, no output captured -> Standard Output / Performance% / Quality% / OEE% all null.
  logIdMissing = await createLog({
    logDate: D2,
    shift: 'General',
    lineId: testLineId,
    plannedMinutes: 480,
  });

  // Small log: 60 planned, 0 downtime, perfect output -> 100% OEE.
  logIdSmall = await createLog({
    logDate: D3,
    shift: 'General',
    lineId: testLineId,
    modelId: testModelId,
    plannedMinutes: 60,
    totalOutputQty: 90,
    goodQty: 90,
  });

  // Large log: 600 planned, 300 downtime -> 50% availability, otherwise perfect -> 50% OEE.
  logIdBig = await createLog({
    logDate: D4,
    shift: 'General',
    lineId: testLineId,
    modelId: testModelId,
    plannedMinutes: 600,
    totalOutputQty: 450,
    goodQty: 450,
    downtimeEntries: [{ reason: 'Power Failure', minutes: 300 }],
  });
});

afterAll(async () => {
  const logIds = [logIdFull, logIdMissing, logIdSmall, logIdBig];
  await prisma.downtimeLog.deleteMany({ where: { logId: { in: logIds } } });
  await prisma.dailyProductionLog.deleteMany({ where: { logId: { in: logIds } } });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('GET /api/oee/:logId', () => {
  it('returns the full breakdown for a fully-populated log', async () => {
    const res = await request(oeeApp).get(`/api/oee/${logIdFull}`).set(readHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.downtimeMinutes).toBe(60);
    expect(data.runTimeMinutes).toBe(420);
    expect(data.availabilityPct).toBe(87.5);
    expect(data.standardOutput).toBe(630); // (420 * 60) / 40
    expect(data.performancePct).toBe(79.37); // round2(500 / 630 * 100)
    expect(data.qualityPct).toBe(96); // 480 / 500 * 100
    expect(data.oeePct).toBe(66.67); // round2(87.5 * 79.37 * 96 / 10000)
    expect(data.notes).toHaveLength(0);
  });

  it('returns null Standard Output / Performance% / Quality% / OEE% with notes when model and output are missing', async () => {
    const res = await request(oeeApp).get(`/api/oee/${logIdMissing}`).set(readHeader);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.availabilityPct).toBe(100); // unaffected — plannedMinutes/downtime are both present
    expect(data.standardOutput).toBeNull();
    expect(data.performancePct).toBeNull();
    expect(data.qualityPct).toBeNull();
    expect(data.oeePct).toBeNull();
    expect(Array.isArray(data.notes)).toBe(true);
    expect(data.notes.length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown logId', async () => {
    const res = await request(oeeApp).get('/api/oee/DOES-NOT-EXIST').set(readHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/oee', () => {
  it('returns one row per matching daily log, sorted by logDate desc', async () => {
    const res = await request(oeeApp)
      .get('/api/oee')
      .set(readHeader)
      .query({ dateFrom: RANGE_START, dateTo: RANGE_END, lineId: testLineId, pageSize: 50 });

    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(items.map((i: { logId: string }) => i.logId)).toEqual([logIdBig, logIdSmall, logIdMissing, logIdFull]);
    expect(items[0]).toHaveProperty('availabilityPct');
    expect(items[0]).toHaveProperty('notes');
  });

  it('rejects a request missing dateFrom/dateTo', async () => {
    const res = await request(oeeApp).get('/api/oee').set(readHeader).query({ lineId: testLineId });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/oee/summary — date range validation', () => {
  it('rejects a missing date range', async () => {
    const res = await request(oeeApp).get('/api/oee/summary').set(readHeader);
    expect(res.status).toBe(400);
  });

  it('rejects dateFrom after dateTo', async () => {
    const res = await request(oeeApp).get('/api/oee/summary').set(readHeader).query({ dateFrom: D4, dateTo: D1 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/oee/summary — summed-ratio aggregation', () => {
  it('aggregates the small (100% OEE) and large (50% OEE) logs via summed ratios, not an averaged percentage', async () => {
    const res = await request(oeeApp)
      .get('/api/oee/summary')
      .set(readHeader)
      .query({ dateFrom: D3, dateTo: D4, lineId: testLineId });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.logCount).toBe(2);

    // Naive average of (100 + 50) / 2 would be 75 — the correct summed-ratio
    // answer weights by each log's planned/run time instead.
    expect(data.availabilityPct).toBe(54.55); // round2((60 + 300) / (60 + 600) * 100)
    expect(data.availabilityPct).not.toBe(75);
    expect(data.performancePct).toBe(100);
    expect(data.qualityPct).toBe(100);
    expect(data.oeePct).toBe(54.55);
    expect(data.excludedLogsCount).toEqual({ availability: 0, performance: 0, quality: 0 });
  });

  it('excludes the log missing model/output data from performance & quality sums, but not availability, and reports the counts', async () => {
    const res = await request(oeeApp)
      .get('/api/oee/summary')
      .set(readHeader)
      .query({ dateFrom: RANGE_START, dateTo: RANGE_END, lineId: testLineId });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.logCount).toBe(4);
    expect(data.excludedLogsCount).toEqual({ availability: 0, performance: 1, quality: 1 });
  });
});

describe('GET /api/oee/by-line', () => {
  it('returns one aggregated result per line', async () => {
    const res = await request(oeeApp)
      .get('/api/oee/by-line')
      .set(readHeader)
      .query({ dateFrom: RANGE_START, dateTo: RANGE_END, lineId: testLineId });

    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ lineId: string; logCount: number }>;
    const ourLine = rows.find((r) => r.lineId === testLineId);
    expect(ourLine).toBeDefined();
    expect(ourLine?.logCount).toBe(4);
  });
});

describe('GET /api/oee/downtime-by-reason — alias for the Module 3 endpoint', () => {
  it('returns totals grouped by reason without duplicating the underlying query', async () => {
    const res = await request(oeeApp)
      .get('/api/oee/downtime-by-reason')
      .set(readHeader)
      .query({ dateFrom: D1, dateTo: D1, lineId: testLineId });

    expect(res.status).toBe(200);
    const reasons = res.body.data.map((r: { reason: string }) => r.reason);
    expect(reasons).toContain('Machine Breakdown');
  });
});
