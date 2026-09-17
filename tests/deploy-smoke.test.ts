import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import {
  probeProductionHealth,
  runSandboxedSmokeCommand,
  runSmokeSuite,
  classifySmokeError,
  executeTwoStrikeSmokeFilter,
  formatSmokeAlertComment,
  type SmokeRunResult,
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

describe('classifySmokeError', () => {
  it('classifies INFRA for network errors, timeouts, 401/403, and harness crashes', () => {
    expect(classifySmokeError('read ECONNRESET')).toBe('INFRA');
    expect(classifySmokeError('connect ECONNREFUSED 127.0.0.1:8080')).toBe('INFRA');
    expect(classifySmokeError('ETIMEDOUT while connecting')).toBe('INFRA');
    expect(classifySmokeError('getaddrinfo ENOTFOUND api.internal')).toBe('INFRA');
    expect(classifySmokeError('fetch failed')).toBe('INFRA');
    expect(classifySmokeError('socket hang up')).toBe('INFRA');
    expect(classifySmokeError('network timeout after 5000ms')).toBe('INFRA');
    expect(classifySmokeError('harness crash: out of memory')).toBe('INFRA');
    expect(classifySmokeError('any error', undefined, true)).toBe('INFRA');
    expect(classifySmokeError('auth failed', 401)).toBe('INFRA');
    expect(classifySmokeError('access denied', 403)).toBe('INFRA');
  });

  it('classifies APP for 500 errors, SHA mismatch, and assertion failures', () => {
    expect(classifySmokeError('Internal Server Error', 500)).toBe('APP');
    expect(classifySmokeError('Bad Gateway', 502)).toBe('APP');
    expect(classifySmokeError('Gateway Timeout', 504)).toBe('APP');
    expect(classifySmokeError('Deployed commit SHA mismatch: expected a, observed b (stale slot swap detected)')).toBe('APP');
    expect(classifySmokeError('AssertionError: expected 200 to be 200')).toBe('APP');
    expect(classifySmokeError('Failed: expected status 200 but received 404')).toBe('APP');
  });
});

describe('executeTwoStrikeSmokeFilter', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
    vi.restoreAllMocks();
  });

  it('first run pass -> outcome: passed, smokeEvidence recorded in StateStore', async () => {
    const mockPassRun: SmokeRunResult = {
      passed: true,
      classification: 'NONE',
      failures: [],
      stdout: 'Smoke checks passed',
      stderr: '',
      durationMs: 1200,
    };

    const runnerFn = vi.fn().mockResolvedValue(mockPassRun);

    const result = await executeTwoStrikeSmokeFilter({
      workItemId: 5001,
      commitSha: 'a1b2c3d4e5f6',
      runnerFn,
    });

    expect(runnerFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('passed');
    expect(result.flakeCleared).toBe(false);
    expect(result.firstRun.passed).toBe(true);

    const ticket = await stateStore.getTicketState(5001);
    expect(ticket).not.toBeNull();
    expect(ticket?.smokeRuns).toHaveLength(1);
    expect(ticket?.smokeRuns?.[0].status).toBe('passed');
    expect(ticket?.smokeRuns?.[0].strikeCount).toBe(0);
    expect(ticket?.smokeEvidence).not.toBeNull();
    expect(ticket?.smokeEvidence?.status).toBe('passed');
    expect(ticket?.smokeEvidence?.flakeCleared).toBe(false);
  });

  it('first run fail, second run pass -> outcome: flaked, flakeCleared: true, recorded in StateStore', async () => {
    const mockFailRun: SmokeRunResult = {
      passed: false,
      classification: 'INFRA',
      failures: [
        {
          testFile: 'smoke',
          testName: 'probe',
          errorMessage: 'fetch failed: socket hang up',
        },
      ],
      stdout: '',
      stderr: 'socket hang up',
      durationMs: 2000,
    };

    const mockPassRun: SmokeRunResult = {
      passed: true,
      classification: 'NONE',
      failures: [],
      stdout: 'all green',
      stderr: '',
      durationMs: 1500,
    };

    const runnerFn = vi
      .fn()
      .mockResolvedValueOnce(mockFailRun)
      .mockResolvedValueOnce(mockPassRun);

    const result = await executeTwoStrikeSmokeFilter({
      workItemId: 5002,
      commitSha: 'b2c3d4e5f6a1',
      runnerFn,
    });

    expect(runnerFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('flaked');
    expect(result.flakeCleared).toBe(true);
    expect(result.secondRun?.passed).toBe(true);

    const ticket = await stateStore.getTicketState(5002);
    expect(ticket?.smokeRuns).toHaveLength(2);
    expect(ticket?.smokeRuns?.[0].status).toBe('failed');
    expect(ticket?.smokeRuns?.[1].status).toBe('flaked');
    expect(ticket?.smokeEvidence?.status).toBe('passed');
    expect(ticket?.smokeEvidence?.flakeCleared).toBe(true);
  });

  it('first run fail, second run fail with same error -> outcome: failed, identicalFailures: true, classification: APP', async () => {
    const failures = [
      {
        testFile: 'tests/smoke.test.ts',
        testName: 'GET /api/v1/health',
        errorMessage: 'AssertionError: expected 500 to be 200 at 2026-09-18T10:00:00Z',
      },
    ];

    const mockFailRun1: SmokeRunResult = {
      passed: false,
      classification: 'APP',
      failures,
      stdout: 'FAIL',
      stderr: '',
      durationMs: 1800,
    };

    const mockFailRun2: SmokeRunResult = {
      passed: false,
      classification: 'APP',
      failures,
      stdout: 'FAIL',
      stderr: '',
      durationMs: 1900,
    };

    const runnerFn = vi
      .fn()
      .mockResolvedValueOnce(mockFailRun1)
      .mockResolvedValueOnce(mockFailRun2);

    const result = await executeTwoStrikeSmokeFilter({
      workItemId: 5003,
      commitSha: 'c3d4e5f6a1b2',
      runnerFn,
    });

    expect(runnerFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('failed');
    expect(result.flakeCleared).toBe(false);
    expect(result.identicalFailures).toBe(true);
    expect(result.classification).toBe('APP');

    const ticket = await stateStore.getTicketState(5003);
    expect(ticket?.smokeRuns).toHaveLength(2);
    expect(ticket?.smokeRuns?.[1].strikeCount).toBe(2);
    expect(ticket?.smokeEvidence?.status).toBe('failed');
    expect(ticket?.smokeEvidence?.classification).toBe('APP');
  });

  it('first run fail, second run fail with ECONNRESET -> outcome: failed, classification: INFRA', async () => {
    const infraFailure = [
      {
        testFile: 'smoke',
        testName: 'connection',
        errorMessage: 'read ECONNRESET',
      },
    ];

    const mockFailRun1: SmokeRunResult = {
      passed: false,
      classification: 'INFRA',
      failures: infraFailure,
      stdout: '',
      stderr: 'read ECONNRESET',
      durationMs: 1000,
    };

    const mockFailRun2: SmokeRunResult = {
      passed: false,
      classification: 'INFRA',
      failures: infraFailure,
      stdout: '',
      stderr: 'read ECONNRESET',
      durationMs: 1100,
    };

    const runnerFn = vi
      .fn()
      .mockResolvedValueOnce(mockFailRun1)
      .mockResolvedValueOnce(mockFailRun2);

    const result = await executeTwoStrikeSmokeFilter({
      workItemId: 5004,
      commitSha: 'd4e5f6a1b2c3',
      runnerFn,
    });

    expect(runnerFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('failed');
    expect(result.classification).toBe('INFRA');

    const ticket = await stateStore.getTicketState(5004);
    expect(ticket?.smokeEvidence?.status).toBe('failed');
    expect(ticket?.smokeEvidence?.classification).toBe('INFRA');
  });
});

describe('formatSmokeAlertComment', () => {
  it('formats comment with loop shield, APP alert header, and emergency rollback command', () => {
    const comment = formatSmokeAlertComment({
      workItemId: 5005,
      commitSha: 'abcdef1234567890',
      classification: 'APP',
      reasons: ['HTTP 500 Internal Server Error on /health', 'AssertionError: expected 200 to be 200'],
      rollbackCommand: 'az webapp deployment slot swap --name myapp --slot staging --action reset',
    });

    expect(comment).toContain('<!-- [automated-agent] -->');
    expect(comment).toContain('🚨 [L6 Smoke Alert] Production Smoke Regression');
    expect(comment).toContain('Emergency Rollback Command:');
    expect(comment).toContain('az webapp deployment slot swap');
    expect(comment).toContain('HTTP 500 Internal Server Error');
  });

  it('formats comment with loop shield and harness error header without rollback command for INFRA', () => {
    const comment = formatSmokeAlertComment({
      workItemId: 5006,
      commitSha: '123456abcdef7890',
      classification: 'INFRA',
      reasons: ['connect ECONNREFUSED 127.0.0.1:443', 'Smoke execution timed out'],
      rollbackCommand: 'az webapp deployment slot swap --name myapp',
    });

    expect(comment).toContain('<!-- [automated-agent] -->');
    expect(comment).toContain('⚠️ [L6 Smoke Alert] Production Smoke Harness Infrastructure Error');
    expect(comment).toContain('[smoke-harness-error]');
    expect(comment).not.toContain('Emergency Rollback Command:');
    expect(comment).not.toContain('az webapp deployment slot swap');
  });

  it('sanitizes malicious script and HTML content in alert reasons and sha', () => {
    const comment = formatSmokeAlertComment({
      workItemId: 5007,
      commitSha: '<script>alert("pwned")</script>12345678',
      classification: 'APP',
      reasons: ['<script>evil()</script>', 'Valid error message'],
    });

    expect(comment).toContain('<!-- [automated-agent] -->');
    expect(comment).not.toContain('<script>');
    expect(comment).not.toContain('</script>');
    expect(comment).toContain('Valid error message');
  });
});
