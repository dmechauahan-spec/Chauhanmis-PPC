import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// buildCorsOptions() reads env at call time, so env is mocked here to drive
// its branches deterministically — independent of whatever the real .env
// happens to contain for this test run.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { CORS_ALLOWED_ORIGINS: undefined as string | undefined, NODE_ENV: 'development' },
}));
vi.mock('./env', () => ({ env: mockEnv }));
vi.mock('../middleware/requestLogger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { buildCorsOptions } from './cors';

beforeEach(() => {
  mockEnv.CORS_ALLOWED_ORIGINS = undefined;
  mockEnv.NODE_ENV = 'development';
});

describe('buildCorsOptions', () => {
  it('returns the explicit allowlist when CORS_ALLOWED_ORIGINS is set, regardless of NODE_ENV', () => {
    mockEnv.CORS_ALLOWED_ORIGINS = 'https://a.example, https://b.example';
    mockEnv.NODE_ENV = 'production';
    expect(buildCorsOptions()).toEqual({ origin: ['https://a.example', 'https://b.example'] });
  });

  it('falls back to allowing localhost origins when unset outside production', () => {
    mockEnv.NODE_ENV = 'development';
    const options = buildCorsOptions();
    expect(options.origin).toBeInstanceOf(RegExp);
    const pattern = options.origin as RegExp;
    expect(pattern.test('http://localhost:5173')).toBe(true);
    expect(pattern.test('http://127.0.0.1:3000')).toBe(true);
    expect(pattern.test('https://evil.example')).toBe(false);
  });

  it('disallows all cross-origin requests when unset in production', () => {
    mockEnv.NODE_ENV = 'production';
    expect(buildCorsOptions()).toEqual({ origin: false });
  });
});

describe('CORS enforcement via the cors() middleware', () => {
  function buildApp(corsOptions: ReturnType<typeof buildCorsOptions>) {
    const app = express();
    app.use(cors(corsOptions));
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    return app;
  }

  it('sets Access-Control-Allow-Origin for a request from an allowed origin', async () => {
    mockEnv.CORS_ALLOWED_ORIGINS = 'http://allowed.example';
    const app = buildApp(buildCorsOptions());

    const res = await request(app).get('/ping').set('Origin', 'http://allowed.example');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.example');
  });

  it('omits Access-Control-Allow-Origin for a request from a non-allowed origin — the request still ' +
    'completes (CORS is enforced by the browser, not the server), just without the header a browser ' +
    'needs to let the calling page read the response', async () => {
    mockEnv.CORS_ALLOWED_ORIGINS = 'http://allowed.example';
    const app = buildApp(buildCorsOptions());

    const res = await request(app).get('/ping').set('Origin', 'http://not-allowed.example');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('omits Access-Control-Allow-Origin for any origin when unset in production (origin: false)', async () => {
    mockEnv.NODE_ENV = 'production';
    const app = buildApp(buildCorsOptions());

    const res = await request(app).get('/ping').set('Origin', 'http://anything.example');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
