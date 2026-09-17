import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../src/config/env.js';
import {
  probeProductionHealth,
  runSandboxedSmokeCommand,
  runSmokeSuite,
} from '../src/deploy/smoke.js';

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

describe('runSandboxedSmokeCommand', () => {
  const originalPat = env.ADO_PAT;
  const originalKey = env.OPENAI_API_KEY;
  const originalSecret = env.ADO_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (env as any).ADO_PAT = originalPat;
    (env as any).OPENAI_API_KEY = originalKey;
    (env as any).ADO_WEBHOOK_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it('returns passed: true with empty failures on exitCode 0', async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'Smoke test passed\nAll 3 critical endpoints green',
      stderr: '',
      timedOut: false,
    });

    const result = await runSandboxedSmokeCommand({
      worktreePath: '/tmp/worktree',
      command: 'npm run test:smoke',
      runnerFn: mockRunner as any,
    });

    expect(mockRunner).toHaveBeenCalledWith(
      'npm',
      ['run', 'test:smoke'],
      expect.objectContaining({
        cwd: '/tmp/worktree',
        timeoutMs: env.SMOKE_TIMEOUT_MS,
      }),
      expect.any(Array)
    );
    expect(result.passed).toBe(true);
    expect(result.classification).toBe('NONE');
    expect(result.failures).toEqual([]);
    expect(result.stdout).toContain('Smoke test passed');
  });

  it('returns passed: false and extracts failures on non-zero exit code', async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: 'FAIL tests/smoke.test.ts > GET /health > status 200\nAssertionError: expected 500 to be 200',
      stderr: '',
      timedOut: false,
    });

    const result = await runSandboxedSmokeCommand({
      worktreePath: '/tmp/worktree',
      command: 'npm run test:smoke',
      runnerFn: mockRunner as any,
    });

    expect(result.passed).toBe(false);
    expect(result.classification).toBe('APP');
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0].errorMessage).toContain('AssertionError');
  });

  it('returns passed: false and classifies as INFRA on timeout', async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 124,
      stdout: '',
      stderr: 'Command timed out after 300000ms',
      timedOut: true,
    });

    const result = await runSandboxedSmokeCommand({
      worktreePath: '/tmp/worktree',
      runnerFn: mockRunner as any,
    });

    expect(result.passed).toBe(false);
    expect(result.classification).toBe('INFRA');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].errorMessage).toContain('Smoke execution timed out');
  });

  it('scrubs known secrets and enforces timeout ceiling <= 300,000ms', async () => {
    (env as any).ADO_PAT = 'ado-pat-secret-123';
    (env as any).OPENAI_API_KEY = 'openai-key-secret-456';
    (env as any).ADO_WEBHOOK_SECRET = 'webhook-secret-789';

    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      timedOut: false,
    });

    await runSandboxedSmokeCommand({
      worktreePath: '/tmp/worktree',
      command: 'npm test',
      timeoutMs: 600_000, // exceeds 300,000 ceiling
      runnerFn: mockRunner as any,
    });

    expect(mockRunner).toHaveBeenCalledWith(
      'npm',
      ['test'],
      expect.objectContaining({
        timeoutMs: 300_000,
      }),
      expect.arrayContaining([
        'ado-pat-secret-123',
        'openai-key-secret-456',
        'webhook-secret-789',
      ])
    );
  });
});

describe('runSmokeSuite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns failure when health probe fails without running command', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: async () => ({ error: 'Service Unavailable' }),
      }))
    );

    const result = await runSmokeSuite({
      workItemId: 100,
      commitSha: 'c0ffee0',
      smokeUrl: 'https://prod.example.com/health',
      worktreePath: '/tmp/worktree',
    });

    expect(result.passed).toBe(false);
    expect(result.classification).toBe('APP');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].testFile).toBe('health_probe');
  });

  it('passes when health probe succeeds and no worktreePath provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-commit-sha': 'c0ffee0' }),
        json: async () => ({ status: 'ok' }),
      }))
    );

    const result = await runSmokeSuite({
      workItemId: 100,
      commitSha: 'c0ffee0',
      smokeUrl: 'https://prod.example.com/health',
    });

    expect(result.passed).toBe(true);
    expect(result.classification).toBe('NONE');
    expect(result.failures).toHaveLength(0);
  });
});
