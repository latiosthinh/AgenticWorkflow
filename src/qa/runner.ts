import { runCommand } from '../sandbox/runner.js';
import { env } from '../config/env.js';
import { parseVitestSummary, pruneTestDiagnostics } from '../test-runner/parser.js';
import {
  extractFailureFingerprints,
  compareFailures,
  type TestFailure,
  type FailureFingerprint,
} from './fingerprint.js';
import { stateStore } from '../state/index.js';
import type { QaRunEntry } from '../state/types.js';
import { workItemQueueManager, laneContext } from '../queue/lane-manager.js';

export interface QaRunResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  failures: FailureFingerprint[];
  parsedSummary: {
    totalTests: number;
    passed: number;
    failed: number;
  };
}

export interface TwoStrikeResult {
  outcome: 'passed' | 'failed' | 'flaked';
  firstRun: QaRunResult;
  secondRun?: QaRunResult;
  flakeCleared: boolean;
  identicalFailures: boolean;
  diff: string[];
}

export async function checkStagingHealth(
  url?: string
): Promise<{ healthy: boolean; status?: number; error?: string }> {
  const targetUrl = url || env.STAGING_HEALTH_URL;
  if (!targetUrl) {
    // ponytail: absent STAGING_HEALTH_URL skips the staging pre-flight (healthy by default);
    // fine for local/test. Ceiling: production could deploy without a health probe.
    // v2: require STAGING_HEALTH_URL via config validation when NODE_ENV=production.
    return { healthy: true, error: undefined };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      method: 'GET',
    });
    clearTimeout(timeoutId);

    const healthy = res.status >= 200 && res.status < 300;
    return {
      healthy,
      status: res.status,
      error: healthy ? undefined : `Health check returned HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      healthy: false,
      error: err?.message || 'Health check failed to connect',
    };
  }
}

export async function runQaSuite(
  worktreePath: string,
  testCommand?: string,
  runnerFn?: typeof runCommand
): Promise<QaRunResult> {
  const cmdStr = testCommand || env.QA_TEST_COMMAND;
  const parts = cmdStr.trim().split(/\s+/);
  const binary = parts[0];
  const args = parts.slice(1);

  const start = Date.now();
  const execFn = runnerFn || runCommand;
  const result = await execFn(
    binary,
    args,
    {
      cwd: worktreePath,
      timeoutMs: env.QA_TIMEOUT_MS,
    },
    [env.ADO_PAT, env.OPENAI_API_KEY, env.ADO_WEBHOOK_SECRET, env.API_KEY].filter(
      Boolean
    ) as string[]
  );
  const durationMs = Date.now() - start;

  const passed = result.exitCode === 0 && !result.timedOut;
  const summary = parseVitestSummary(result.stdout, durationMs);
  const diagnostics = pruneTestDiagnostics(result.stdout, result.stderr);

  const testFailures: TestFailure[] = diagnostics.failingTests.map((t, idx) => {
    // Expected format: "FAIL tests/foo.test.ts > suite > test name" or similar
    const cleanTest = t.replace(/^FAIL\s+/, '');
    const parts = cleanTest.split('>');
    const testFile = parts[0].trim();
    const testName = parts.slice(1).join('>').trim() || cleanTest;
    const errorMessage = diagnostics.assertionErrors[idx] || diagnostics.assertionErrors[0] || t;

    return {
      testFile,
      testName,
      errorMessage,
      stackTrace: diagnostics.prunedStackTrace.join('\n'),
    };
  });

  const failureFingerprints = extractFailureFingerprints(testFailures);

  return {
    passed,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs,
    failures: failureFingerprints,
    parsedSummary: {
      totalTests: summary.totalTests,
      passed: summary.passed,
      failed: summary.failed || (passed ? 0 : Math.max(1, failureFingerprints.length)),
    },
  };
}

export async function executeTwoStrikeQaFilter(options: {
  workItemId: number;
  commitSha: string;
  worktreePath: string;
  testCommand?: string;
  runnerFn?: (runIndex: number) => Promise<QaRunResult>;
}): Promise<TwoStrikeResult> {
  const { workItemId, worktreePath, testCommand, runnerFn } = options;

  const recordRun = async (entry: QaRunEntry) => {
    const mutate = async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.qaRuns.push(entry);
      });
    };
    if (laneContext.getStore()?.workItemId === workItemId) {
      await mutate();
    } else {
      await workItemQueueManager.runInLane(workItemId, mutate);
    }
  };

  // Run 1
  const run1 = runnerFn
    ? await runnerFn(1)
    : await runQaSuite(worktreePath, testCommand);

  await recordRun({
    runIndex: 1,
    strikeCount: run1.passed ? 0 : 1,
    status: run1.passed ? 'passed' : 'failed',
    failedTestSignatures: JSON.stringify(run1.failures),
    stdout: run1.stdout,
    stderr: run1.stderr,
    durationMs: run1.durationMs,
    createdAt: new Date().toISOString(),
  });

  if (run1.passed) {
    return {
      outcome: 'passed',
      firstRun: run1,
      flakeCleared: false,
      identicalFailures: false,
      diff: [],
    };
  }

  // Run 2 (Sequential Rerun upon initial failure)
  const run2 = runnerFn
    ? await runnerFn(2)
    : await runQaSuite(worktreePath, testCommand);

  if (run2.passed) {
    // Flake cleared! Run 1 failed, but Run 2 succeeded
    await recordRun({
      runIndex: 2,
      strikeCount: 1,
      status: 'flaked',
      failedTestSignatures: JSON.stringify([]),
      stdout: run2.stdout,
      stderr: run2.stderr,
      durationMs: run2.durationMs,
      createdAt: new Date().toISOString(),
    });

    return {
      outcome: 'flaked',
      firstRun: run1,
      secondRun: run2,
      flakeCleared: true,
      identicalFailures: false,
      diff: [],
    };
  }

  // Both runs failed - compare failure fingerprints
  const comparison = compareFailures(run1.failures, run2.failures);

  await recordRun({
    runIndex: 2,
    strikeCount: 2,
    status: 'failed',
    failedTestSignatures: JSON.stringify(run2.failures),
    stdout: run2.stdout,
    stderr: run2.stderr,
    durationMs: run2.durationMs,
    createdAt: new Date().toISOString(),
  });

  return {
    outcome: 'failed',
    firstRun: run1,
    secondRun: run2,
    flakeCleared: false,
    identicalFailures: comparison.isIdentical,
    diff: comparison.diff,
  };
}
