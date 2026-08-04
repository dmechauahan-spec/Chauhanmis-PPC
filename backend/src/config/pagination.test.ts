import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../testUtils/buildTestApp';
import { prisma } from '../db/client';
import { getAuthHeader } from '../testUtils/auth';
import linesRouter from '../modules/lines/lines.routes';
import hrRouter from '../modules/hr/hr.routes';
import searchRouter from '../modules/search/search.routes';
import { MAX_PAGE_SIZE, SEARCH_MAX_RESULTS_PER_TYPE } from './pagination';

// Confirms the shared pagination constants (src/config/pagination.ts) are
// actually wired up, not just defined: two unrelated modules that both use
// the shared paginationQuerySchema reject the same out-of-range pageSize at
// the same boundary, and /api/search's separately-named, intentionally
// lower cap rejects at its own boundary — matching this codebase's existing
// "reject, don't clamp" handling of every other out-of-range input.
describe('shared pagination limits', () => {
  const linesApp = buildTestApp('/api/lines', linesRouter);
  const hrApp = buildTestApp('/api/hr-teams', hrRouter);
  const searchApp = buildTestApp('/api/search', searchRouter);

  let readHeader: { Authorization: string };

  beforeAll(async () => {
    readHeader = await getAuthHeader(UserRole.ProductionManager);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts pageSize at MAX_PAGE_SIZE on lines and hr-teams alike', async () => {
    const linesRes = await request(linesApp).get('/api/lines').set(readHeader).query({ pageSize: MAX_PAGE_SIZE });
    const hrRes = await request(hrApp).get('/api/hr-teams').set(readHeader).query({ pageSize: MAX_PAGE_SIZE });

    expect(linesRes.status).toBe(200);
    expect(hrRes.status).toBe(200);
  });

  it('rejects pageSize above MAX_PAGE_SIZE identically on lines and hr-teams', async () => {
    const linesRes = await request(linesApp)
      .get('/api/lines')
      .set(readHeader)
      .query({ pageSize: MAX_PAGE_SIZE + 1 });
    const hrRes = await request(hrApp)
      .get('/api/hr-teams')
      .set(readHeader)
      .query({ pageSize: MAX_PAGE_SIZE + 1 });

    expect(linesRes.status).toBe(400);
    expect(hrRes.status).toBe(400);
  });

  it('accepts limit at SEARCH_MAX_RESULTS_PER_TYPE on search', async () => {
    const res = await request(searchApp)
      .get('/api/search')
      .set(readHeader)
      .query({ q: 'zz', limit: SEARCH_MAX_RESULTS_PER_TYPE });

    expect(res.status).toBe(200);
  });

  it('rejects limit above SEARCH_MAX_RESULTS_PER_TYPE on search, same as the other modules', async () => {
    const res = await request(searchApp)
      .get('/api/search')
      .set(readHeader)
      .query({ q: 'zz', limit: SEARCH_MAX_RESULTS_PER_TYPE + 1 });

    expect(res.status).toBe(400);
  });
});
