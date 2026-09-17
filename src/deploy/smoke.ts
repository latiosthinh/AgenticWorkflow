import { env } from '../config/env.js';
import { runCommand } from '../sandbox/runner.js';
import type { TestFailure } from '../qa/fingerprint.js';
import type { SmokeRunEntry, SmokeEvidenceState } from '../state/types.js';

export interface SmokeRunResult {
  passed: boolean;
  classification?: 'INFRA' | 'APP' | 'NONE';
  failures: TestFailure[];
  stdout?: string;
  stderr?: string;
  durationMs: number;
}

export interface HealthProbeResult {
  healthy: boolean;
  status?: number;
  actualSha?: string;
  error?: string;
  classification?: 'INFRA' | 'APP';
}

/**
 * Health probe for production deployment verification.
 * Fails closed in production if PRODUCTION_SMOKE_URL is not configured.
 * Probes the target URL using native fetch with a 10s AbortController timeout.
 * Verifies HTTP status and commit SHA to detect stale slot swaps.
 */
export async function probeProductionHealth(
  url?: string,
  expectedSha?: string
): Promise<HealthProbeResult> {
  const targetUrl = url || env.PRODUCTION_SMOKE_URL;

  if (!targetUrl) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        '[smoke] PRODUCTION_SMOKE_URL is required in production (fail-closed); refusing to bypass smoke checks'
      );
    }
    // ponytail: fallback healthy stub in non-production environments when smoke URL unset
    return { healthy: true, status: 200, actualSha: expectedSha };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (res.status >= 500) {
      return {
        healthy: false,
        status: res.status,
        classification: 'APP',
        error: `Production health endpoint returned HTTP ${res.status}`,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        healthy: false,
        status: res.status,
        classification: 'INFRA',
        error: `Production health endpoint returned authentication error HTTP ${res.status}`,
      };
    }

    if (!res.ok) {
      return {
        healthy: false,
        status: res.status,
        classification: 'APP',
        error: `Production health endpoint returned HTTP ${res.status}`,
      };
    }

    // SHA verification to detect stale slot swaps
    let actualSha = res.headers.get('x-commit-sha') || res.headers.get('x-version') || undefined;
    try {
      const body = await res.json();
      if (body && typeof body === 'object') {
        actualSha = body.commitSha || body.gitSha || body.version || actualSha;
      }
    } catch {
      // Body not JSON; header fallback
    }

    if (expectedSha && actualSha) {
      const match =
        actualSha.startsWith(expectedSha.slice(0, 7)) ||
        expectedSha.startsWith(actualSha.slice(0, 7));
      if (!match) {
        return {
          healthy: false,
          status: res.status,
          actualSha,
          classification: 'APP',
          error: `Deployed commit SHA mismatch: expected ${expectedSha.slice(0, 8)}, observed ${actualSha.slice(0, 8)} (stale slot swap detected)`,
        };
      }
    }

    return { healthy: true, status: res.status, actualSha };
  } catch (err: any) {
    return {
      healthy: false,
      classification: 'INFRA',
      error: err?.message || 'Failed to connect to production smoke endpoint',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Executes a smoke test command in a sandboxed subprocess via runCommand.
 * Enforces timeout ceiling <= 300,000ms, scrubs secrets, and parses failure signatures.
 */
export async function runSandboxedSmokeCommand(options: {
  worktreePath: string;
  command?: string;
  timeoutMs?: number;
  runnerFn?: typeof runCommand;
}): Promise<SmokeRunResult> {
  const rawCommand = options.command || env.SMOKE_TEST_COMMAND || 'npm run test:smoke';
  const parts = rawCommand.trim().split(/\s+/);
  const binary = parts[0];
  const args = parts.slice(1);

  const timeoutMs = Math.min(
    options.timeoutMs ?? env.SMOKE_TIMEOUT_MS,
    300_000
  );

  const knownSecrets = [
    env.ADO_PAT,
    env.OPENAI_API_KEY,
    env.ADO_WEBHOOK_SECRET,
  ].filter((s): s is string => Boolean(s));

  const execFn = options.runnerFn || runCommand;
  const start = Date.now();
  const result = await execFn(
    binary,
    args,
    {
      cwd: options.worktreePath,
      timeoutMs,
    },
    knownSecrets
  );
  const durationMs = Date.now() - start;

  if (result.timedOut) {
    return {
      passed: false,
      classification: 'INFRA',
      failures: [
        {
          testFile: 'smoke',
          testName: 'timeout',
          errorMessage: 'Smoke execution timed out',
        },
      ],
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
    };
  }

  if (result.exitCode === 0) {
    return {
      passed: true,
      classification: 'NONE',
      failures: [],
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
    };
  }

  const failures = parseSmokeFailures(result.stdout, result.stderr);
  return {
    passed: false,
    classification: 'APP',
    failures,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs,
  };
}

function parseSmokeFailures(stdout: string, stderr: string): TestFailure[] {
  const combined = `${stdout}\n${stderr}`.trim();
  if (!combined) {
    return [
      {
        testFile: 'smoke',
        testName: 'command_failed',
        errorMessage: 'Smoke test command failed with non-zero exit code',
      },
    ];
  }

  const lines = combined.split('\n').map((l) => l.trim()).filter(Boolean);
  const failHeaders = lines.filter((line) => /^FAIL\s+/i.test(line));
  const assertionErrors = lines.filter(
    (line) =>
      /(?:AssertionError|Error|Exception):/i.test(line) ||
      (!/^FAIL\s+/i.test(line) && /error|failed|assert/i.test(line))
  );

  if (failHeaders.length > 0) {
    return failHeaders.map((header, idx) => {
      const clean = header.replace(/^FAIL\s+/i, '');
      const parts = clean.split('>');
      const testFile = parts.length > 1 ? parts[0].trim() : 'smoke';
      const testName =
        parts.length > 1 ? parts.slice(1).join('>').trim() : clean;
      const errorMessage =
        assertionErrors[idx] || assertionErrors[0] || header;
      return {
        testFile,
        testName,
        errorMessage,
      };
    });
  }

  const failLines = lines.filter((line) =>
    /FAIL|error|Error|assert|failed|exception/i.test(line)
  );

  if (failLines.length > 0) {
    return failLines.map((line, idx) => {
      const clean = line.replace(/^FAIL\s+/i, '');
      const parts = clean.split('>');
      const testFile = parts.length > 1 ? parts[0].trim() : 'smoke';
      const testName =
        parts.length > 1 ? parts.slice(1).join('>').trim() : `smoke_check_${idx + 1}`;
      return {
        testFile,
        testName,
        errorMessage: line,
      };
    });
  }

  return [
    {
      testFile: 'smoke',
      testName: 'command_failed',
      errorMessage: lines.slice(-3).join(' ') || 'Smoke test command failed',
    },
  ];
}

/**
 * Runs the complete smoke suite:
 * 1. Probes production health via HTTP and verifies commit SHA.
 * 2. If worktreePath provided, executes sandboxed smoke test command.
 * Consolidated SmokeRunResult returned.
 */
export async function runSmokeSuite(options: {
  workItemId: number;
  commitSha: string;
  worktreePath?: string;
  smokeUrl?: string;
  testCommand?: string;
}): Promise<SmokeRunResult> {
  const start = Date.now();
  const probe = await probeProductionHealth(options.smokeUrl, options.commitSha);
  if (!probe.healthy) {
    return {
      passed: false,
      classification: probe.classification || 'INFRA',
      failures: [
        {
          testFile: 'health_probe',
          testName: 'probeProductionHealth',
          errorMessage: probe.error || 'Production health probe failed',
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  if (options.worktreePath) {
    const cmdResult = await runSandboxedSmokeCommand({
      worktreePath: options.worktreePath,
      command: options.testCommand,
    });
    return {
      ...cmdResult,
      durationMs: (Date.now() - start) + cmdResult.durationMs,
    };
  }

  return {
    passed: true,
    classification: 'NONE',
    failures: [],
    durationMs: Date.now() - start,
  };
}
