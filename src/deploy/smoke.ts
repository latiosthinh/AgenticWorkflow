import sanitizeHtml from 'sanitize-html';
import { env } from '../config/env.js';
import { runCommand } from '../sandbox/runner.js';
import {
  extractFailureFingerprints,
  compareFailures,
  type TestFailure,
  type FailureFingerprint,
} from '../qa/fingerprint.js';
import { stateStore } from '../state/index.js';
import type { SmokeRunEntry, SmokeEvidenceState } from '../state/types.js';
import { workItemQueueManager, laneContext } from '../queue/lane-manager.js';

export interface SmokeRunResult {
  passed: boolean;
  classification?: 'INFRA' | 'APP' | 'NONE';
  failures: TestFailure[];
  stdout?: string;
  stderr?: string;
  durationMs: number;
}

export interface TwoStrikeSmokeResult {
  outcome: 'passed' | 'failed' | 'flaked';
  firstRun: SmokeRunResult;
  secondRun?: SmokeRunResult;
  flakeCleared: boolean;
  identicalFailures?: boolean;
  classification?: 'INFRA' | 'APP' | 'NONE';
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

    const isSha = (str?: string) => Boolean(str && /^[0-9a-f]{7,40}$/i.test(str));
    if (isSha(expectedSha) && isSha(actualSha)) {
      const match =
        actualSha!.toLowerCase().startsWith(expectedSha!.slice(0, 7).toLowerCase()) ||
        expectedSha!.toLowerCase().startsWith(actualSha!.slice(0, 7).toLowerCase());
      if (!match) {
        return {
          healthy: false,
          status: res.status,
          actualSha,
          classification: 'APP',
          error: `Deployed commit SHA mismatch: expected ${expectedSha!.slice(0, 8)}, observed ${actualSha!.slice(0, 8)} (stale slot swap detected)`,
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

/**
 * Classifies smoke error signatures into INFRA (network blip, timeout, 401/403, harness crash)
 * vs APP (5xx server error, SHA mismatch, test failure).
 */
export function classifySmokeError(
  errorMsg: string,
  statusCode?: number,
  timedOut?: boolean
): 'INFRA' | 'APP' {
  if (timedOut) return 'INFRA';
  if (statusCode === 401 || statusCode === 403) return 'INFRA';
  if (statusCode !== undefined && statusCode >= 500) return 'APP';

  const infraPatterns =
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up|network timeout|harness crash/i;
  if (infraPatterns.test(errorMsg)) {
    return 'INFRA';
  }

  return 'APP';
}

function toFingerprints(failures: Array<TestFailure | FailureFingerprint>): FailureFingerprint[] {
  if (!failures || failures.length === 0) return [];
  if ('hash' in failures[0] && typeof (failures[0] as any).hash === 'string') {
    return failures as FailureFingerprint[];
  }
  return extractFailureFingerprints(failures as TestFailure[]);
}

/**
 * Two-strike flake filter for smoke test execution:
 * 1. Executes Run 1; on success returns outcome: 'passed'.
 * 2. On failure, immediately executes Run 2 sequentially.
 * 3. If Run 2 succeeds, clears flake (outcome: 'flaked', flakeCleared: true).
 * 4. If Run 2 fails, compares fingerprints to verify identical regression.
 * Serializes state updates to StateStore within workItemQueueManager.runInLane.
 */
export async function executeTwoStrikeSmokeFilter(options: {
  workItemId: number;
  commitSha: string;
  worktreePath?: string;
  smokeUrl?: string;
  testCommand?: string;
  runnerFn?: (runIndex: number) => Promise<SmokeRunResult>;
}): Promise<TwoStrikeSmokeResult> {
  const { workItemId, commitSha } = options;

  const recordRun = async (entry: SmokeRunEntry) => {
    const mutate = async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        if (!draft.smokeRuns) {
          draft.smokeRuns = [];
        }
        draft.smokeRuns.push(entry);
      });
    };
    if (laneContext.getStore()?.workItemId === workItemId) {
      await mutate();
    } else {
      await workItemQueueManager.runInLane(workItemId, mutate);
    }
  };

  const recordEvidence = async (evidence: SmokeEvidenceState) => {
    const mutate = async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.smokeEvidence = evidence;
      });
    };
    if (laneContext.getStore()?.workItemId === workItemId) {
      await mutate();
    } else {
      await workItemQueueManager.runInLane(workItemId, mutate);
    }
  };

  // Run 1
  const run1 = options.runnerFn ? await options.runnerFn(1) : await runSmokeSuite(options);
  await recordRun({
    runIndex: 1,
    strikeCount: run1.passed ? 0 : 1,
    status: run1.passed ? 'passed' : 'failed',
    classification: run1.classification || (run1.passed ? 'NONE' : 'APP'),
    failedCheckSignatures: JSON.stringify(run1.failures),
    stdout: run1.stdout,
    stderr: run1.stderr,
    durationMs: run1.durationMs,
    createdAt: new Date().toISOString(),
  });

  if (run1.passed) {
    await recordEvidence({
      status: 'passed',
      classification: 'NONE',
      commitSha,
      smokeUrl: options.smokeUrl || null,
      checksTotal: 1,
      checksPassed: 1,
      checksFailed: 0,
      durationMs: run1.durationMs,
      flakeCleared: false,
      createdAt: new Date().toISOString(),
    });

    return {
      outcome: 'passed',
      firstRun: run1,
      flakeCleared: false,
      identicalFailures: false,
      classification: 'NONE',
    };
  }

  // Run 2 (Sequential Rerun on initial failure)
  const run2 = options.runnerFn ? await options.runnerFn(2) : await runSmokeSuite(options);

  if (run2.passed) {
    await recordRun({
      runIndex: 2,
      strikeCount: 1,
      status: 'flaked',
      classification: 'NONE',
      failedCheckSignatures: JSON.stringify([]),
      stdout: run2.stdout,
      stderr: run2.stderr,
      durationMs: run2.durationMs,
      createdAt: new Date().toISOString(),
    });

    await recordEvidence({
      status: 'passed',
      classification: 'NONE',
      commitSha,
      smokeUrl: options.smokeUrl || null,
      checksTotal: 1,
      checksPassed: 1,
      checksFailed: 0,
      durationMs: run1.durationMs + run2.durationMs,
      flakeCleared: true,
      createdAt: new Date().toISOString(),
    });

    return {
      outcome: 'flaked',
      firstRun: run1,
      secondRun: run2,
      flakeCleared: true,
      identicalFailures: false,
      classification: 'NONE',
    };
  }

  // Both runs failed - compare failure fingerprints & determine classification
  const fp1 = toFingerprints(run1.failures);
  const fp2 = toFingerprints(run2.failures);
  const comparison = compareFailures(fp1, fp2);

  let classification: 'INFRA' | 'APP' = 'APP';
  if (run2.classification === 'INFRA' || run1.classification === 'INFRA') {
    classification = 'INFRA';
  } else if (run2.classification === 'APP' || run1.classification === 'APP') {
    classification = 'APP';
  } else {
    const allErrors = [
      ...(run2.failures || []).map((f) => f.errorMessage),
      ...(run1.failures || []).map((f) => f.errorMessage),
      run2.stderr || '',
      run1.stderr || '',
      run2.stdout || '',
      run1.stdout || '',
    ].join(' ');
    classification = classifySmokeError(allErrors);
  }

  await recordRun({
    runIndex: 2,
    strikeCount: 2,
    status: 'failed',
    classification,
    failedCheckSignatures: JSON.stringify(run2.failures),
    stdout: run2.stdout,
    stderr: run2.stderr,
    durationMs: run2.durationMs,
    createdAt: new Date().toISOString(),
  });

  const totalChecks = Math.max(1, run2.failures.length);
  await recordEvidence({
    status: 'failed',
    classification,
    commitSha,
    smokeUrl: options.smokeUrl || null,
    checksTotal: totalChecks,
    checksPassed: 0,
    checksFailed: totalChecks,
    durationMs: run1.durationMs + run2.durationMs,
    flakeCleared: false,
    createdAt: new Date().toISOString(),
  });

  return {
    outcome: 'failed',
    firstRun: run1,
    secondRun: run2,
    flakeCleared: false,
    identicalFailures: comparison.isIdentical,
    classification,
  };
}

/**
 * Formats a sanitized HTML alert comment for ADO with loop shield marker.
 * Includes rollback command for APP failures and operator instructions for INFRA harness errors.
 */
export function formatSmokeAlertComment(options: {
  workItemId: number;
  commitSha: string;
  classification: 'INFRA' | 'APP';
  reasons: string[];
  rollbackCommand?: string;
}): string {
  const { workItemId, commitSha, classification, reasons, rollbackCommand } = options;
  const isInfra = classification === 'INFRA';
  const header = isInfra
    ? '⚠️ [L6 Smoke Alert] Production Smoke Harness Infrastructure Error'
    : '🚨 [L6 Smoke Alert] Production Smoke Regression';

  const actionText = isInfra
    ? 'Work item retained in <em>Ready to Deploy</em> with tag <code>[smoke-harness-error]</code> for human operator review. Telemetry evaluation suspended.'
    : 'Work item bounced to <em>In Dev</em> with tag <code>[deploy-regressed]</code>. Production rollback procedure initiated.';

  const rollbackBlock =
    !isInfra && rollbackCommand
      ? `<h4>Emergency Rollback Command:</h4>\n  <pre><code>${sanitizeHtml(rollbackCommand)}</code></pre>`
      : '';

  const reasonsList = reasons
    .map((r) => `<li>⚠️ <strong>${sanitizeHtml(r)}</strong></li>`)
    .join('\n');

  const html = `
<div class="smoke-regression-alert">
  <h3>${header}</h3>
  <p>Production smoke verification failed for work item #${workItemId} on release commit <code>${sanitizeHtml(commitSha.slice(0, 8))}</code>.</p>
  <h4>Failure Details (${classification}):</h4>
  <ul>
    ${reasonsList}
  </ul>
  <p><strong>Action Taken:</strong> ${actionText}</p>
  ${rollbackBlock}
</div>
`.trim();

  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'div',
      'h3',
      'h4',
      'p',
      'ul',
      'li',
      'strong',
      'em',
      'code',
      'pre',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      div: ['class'],
    },
  });

  return `${sanitized}\n<!-- [automated-agent] -->`;
}
