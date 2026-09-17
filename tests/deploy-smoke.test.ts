import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { probeProductionHealth } from '../src/deploy/smoke.js';

describe('Production Smoke Suite - probeProductionHealth', () => {
  const originalEnvNodeEnv = env.NODE_ENV;
  const originalSmokeUrl = env.PRODUCTION_SMOKE_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (env as any).NODE_ENV = originalEnvNodeEnv;
    (env as any).PRODUCTION_SMOKE_URL = originalSmokeUrl;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fails closed and throws error when PRODUCTION_SMOKE_URL is missing in production', async () => {
    (env as any).NODE_ENV = 'production';
    (env as any).PRODUCTION_SMOKE_URL = undefined;

    await expect(probeProductionHealth()).rejects.toThrow(
      /PRODUCTION_SMOKE_URL is required in production \(fail-closed\)/
    );
  });

  it('falls back to healthy stub when targetUrl is missing in test or dev environment', async () => {
    (env as any).NODE_ENV = 'test';
    (env as any).PRODUCTION_SMOKE_URL = undefined;

    const result = await probeProductionHealth(undefined, 'abcd1234efgh');
    expect(result.healthy).toBe(true);
    expect(result.status).toBe(200);
    expect(result.actualSha).toBe('abcd1234efgh');
  });

  it('returns healthy: true when HTTP 200 and commit SHA in header matches expected SHA', async () => {
    const mockHeaders = new Headers({
      'x-commit-sha': 'abcd12345678',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: async () => ({ status: 'ok' }),
      }))
    );

    const result = await probeProductionHealth('https://prod.example.com/health', 'abcd12399999');
    expect(result.healthy).toBe(true);
    expect(result.status).toBe(200);
    expect(result.actualSha).toBe('abcd12345678');
  });

  it('returns healthy: true when HTTP 200 and commit SHA in JSON body matches expected SHA', async () => {
    const mockHeaders = new Headers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: async () => ({ commitSha: '112233445566' }),
      }))
    );

    const result = await probeProductionHealth('https://prod.example.com/health', '112233449999');
    expect(result.healthy).toBe(true);
    expect(result.status).toBe(200);
    expect(result.actualSha).toBe('112233445566');
  });

  it('classifies HTTP 500 as APP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ error: 'Internal Server Error' }),
      }))
    );

    const result = await probeProductionHealth('https://prod.example.com/health');
    expect(result.healthy).toBe(false);
    expect(result.status).toBe(500);
    expect(result.classification).toBe('APP');
    expect(result.error).toContain('HTTP 500');
  });

  it('classifies HTTP 401 and 403 as INFRA failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({ error: 'Forbidden' }),
      }))
    );

    const result403 = await probeProductionHealth('https://prod.example.com/health');
    expect(result403.healthy).toBe(false);
    expect(result403.status).toBe(403);
    expect(result403.classification).toBe('INFRA');
    expect(result403.error).toContain('HTTP 403');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: 'Unauthorized' }),
      }))
    );

    const result401 = await probeProductionHealth('https://prod.example.com/health');
    expect(result401.healthy).toBe(false);
    expect(result401.status).toBe(401);
    expect(result401.classification).toBe('INFRA');
    expect(result401.error).toContain('HTTP 401');
  });

  it('classifies network error or timeout as INFRA failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Connection refused to smoke host');
      })
    );

    const result = await probeProductionHealth('https://prod.example.com/health');
    expect(result.healthy).toBe(false);
    expect(result.classification).toBe('INFRA');
    expect(result.error).toContain('Connection refused to smoke host');
  });

  it('detects commit SHA mismatch and classifies as APP failure with stale slot swap detected', async () => {
    const mockHeaders = new Headers({
      'x-commit-sha': 'deadbeef0000',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: async () => ({}),
      }))
    );

    const result = await probeProductionHealth('https://prod.example.com/health', 'feedface1111');
    expect(result.healthy).toBe(false);
    expect(result.classification).toBe('APP');
    expect(result.status).toBe(200);
    expect(result.actualSha).toBe('deadbeef0000');
    expect(result.error).toContain('stale slot swap detected');
  });
});
