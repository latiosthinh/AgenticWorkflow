# Phase 5: Prod Smoke Suite - Pattern Map

**Mapped:** 2026-09-18
**Files analyzed:** 7
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/deploy/smoke.ts` | service | execution / request-response | `src/qa/runner.ts` | exact |
| `src/config/env.ts` | config | transform / validation | `src/config/env.ts` | exact |
| `src/state/types.ts` | model | transform / schema | `src/state/types.ts` | exact |
| `src/deploy/worker.ts` | controller | request-response / pipeline | `src/deploy/worker.ts` | exact |
| `src/deploy/evidence-index.ts` | service | transform / aggregation | `src/deploy/evidence-index.ts` | exact |
| `tests/deploy-smoke.test.ts` | test | request-response / assertion | `tests/qa-runner.test.ts` | exact |
| `tests/deploy-orchestrator.test.ts` | test | request-response / assertion | `tests/deploy-orchestrator.test.ts` | exact |

---

## Pattern Assignments

### `src/deploy/smoke.ts` (service, execution / request-response)

**Analogs:** `src/qa/runner.ts`, `src/deploy/telemetry.ts`, `src/sandbox/runner.ts`, `src/qa/fingerprint.ts`

**Imports pattern** (adapted from `src/qa/runner.ts` lines 1-13 and `src/deploy/telemetry.ts` lines 1-5):
```typescript
import sanitizeHtml from 'sanitize-html';
import { runCommand } from '../sandbox/runner.js';
import { env } from '../config/env.js';
import {
  extractFailureFingerprints,
  compareFailures,
  type TestFailure,
  type FailureFingerprint,
} from '../qa/fingerprint.js';
import { stateStore } from '../state/index.js';
import type { SmokeRunEntry, SmokeEvidenceState } from '../state/types.js';
import { workItemQueueManager, laneContext } from '../queue/lane-manager.js';
```

**HTTP Probe & Version SHA Check pattern** (adapted from `src/qa/runner.ts` lines 37-69 and `src/deploy/telemetry.ts` lines 29-37):
```typescript
// Fail closed in production when smoke URL is missing; probe endpoint with timeout and verify commit SHA
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
    clearTimeout(timeoutId);

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
    clearTimeout(timeoutId);
    return {
      healthy: false,
      classification: 'INFRA',
      error: err?.message || 'Failed to connect to production smoke endpoint',
    };
  }
}
```

**Two-Strike Filter & Error Classification pattern** (adapted from `src/qa/runner.ts` lines 131-229):
```typescript
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

  // Run 1
  const run1 = options.runnerFn ? await options.runnerFn(1) : await runSmokeSuite(options);
  await recordRun({
    runIndex: 1,
    strikeCount: run1.passed ? 0 : 1,
    status: run1.passed ? 'passed' : 'failed',
    classification: run1.classification || 'NONE',
    failedCheckSignatures: JSON.stringify(run1.failures),
    stdout: run1.stdout,
    stderr: run1.stderr,
    durationMs: run1.durationMs,
    createdAt: new Date().toISOString(),
  });

  if (run1.passed) {
    return { outcome: 'passed', firstRun: run1, flakeCleared: false };
  }

  // Run 2 (Sequential Rerun on failure)
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
    return { outcome: 'flaked', firstRun: run1, secondRun: run2, flakeCleared: true };
  }

  // Both runs failed - classify failure & compare fingerprints
  const comparison = compareFailures(run1.failures, run2.failures);
  const classification = run2.classification || run1.classification || 'APP';

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

  return {
    outcome: 'failed',
    firstRun: run1,
    secondRun: run2,
    flakeCleared: false,
    identicalFailures: comparison.isIdentical,
    classification,
  };
}
```

**Sanitized Comment Formatter with Shield pattern** (from `src/deploy/telemetry.ts` lines 182-233):
```typescript
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

  const rollbackBlock = !isInfra && rollbackCommand
    ? `<h4>Emergency Rollback Command:</h4><pre><code>${sanitizeHtml(rollbackCommand)}</code></pre>`
    : '';

  const reasonsList = reasons.map((r) => `<li>⚠️ <strong>${sanitizeHtml(r)}</strong></li>`).join('\n');

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
      'div', 'h3', 'h4', 'p', 'ul', 'li', 'strong', 'em', 'code', 'pre'
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      div: ['class'],
    },
  });

  return `${sanitized}\n<!-- [automated-agent] -->`;
}
```

---

### `src/deploy/worker.ts` (controller, request-response / pipeline)

**Analog:** `src/deploy/worker.ts` lines 88-146, 198-224

**Fail-Fast Sequencing & State Branching pattern**:
```typescript
// Source: src/deploy/worker.ts lines 198-224 + extension
export async function processDeploymentWorkflow(
  workItemId: number,
  revId: number,
  options?: ProcessDeployOptions
): Promise<void> {
  const details = await getWorkItemDetails(workItemId, revId);
  if (details.state !== 'Ready to Deploy') return;

  // 1. Stage preparation & L5 packet
  if (!options?.skipPreparation) {
    await processDeploymentPreparation(workItemId, {
      commitSha: options?.commitSha,
      filesModified: options?.filesModified,
      environmentName: options?.environmentName,
    });
  }

  // 2. Production Smoke Suite (FAIL-FAST)
  const commitSha = options?.commitSha || 'main';
  const smokeResult = await processSmokeVerification(workItemId, {
    commitSha,
    smokeUrl: options?.smokeUrl,
    mockSmokeResult: options?.mockSmokeResult,
  });

  if (smokeResult.outcome === 'failed') {
    // Fails fast: halts deploy without burning 30 min on telemetry window
    return;
  }

  // 3. Telemetry evaluation & completion (only if smoke passed or flake cleared)
  await processTelemetryEvaluation(workItemId, {
    mockMetrics: options?.mockMetrics,
    windowMinutes: options?.windowMinutes,
    commitSha,
  });
}
```

**State/Tag Update on Regression vs Harness Failure pattern** (from `src/deploy/worker.ts` lines 120-145):
```typescript
// On APP failure: bounce to In Dev with [deploy-regressed]
const tagPatch = buildTagPatch(details.tags, '[deploy-regressed]', '[deploying]');
const patch: JsonPatchDocument = [
  { op: Operation.Replace, path: '/fields/System.State', value: 'In Dev' },
  ...tagPatch,
  { op: Operation.Add, path: '/fields/System.History', value: alertComment },
];
await adoClient.updateWorkItem(workItemId, patch);

// On INFRA failure: keep Ready to Deploy, add [smoke-harness-error]
const infraTagPatch = buildTagPatch(details.tags, '[smoke-harness-error]', '[deploying]');
const infraPatch: JsonPatchDocument = [
  ...infraTagPatch,
  { op: Operation.Add, path: '/fields/System.History', value: alertComment },
];
await adoClient.updateWorkItem(workItemId, infraPatch);
```

---

### `src/config/env.ts` (config, transform / validation)

**Analog:** `src/config/env.ts` lines 18-26

**Zod Schema extension pattern**:
```typescript
// Add to EnvSchema in src/config/env.ts
  PRODUCTION_SMOKE_URL: z.string().url().optional(),
  SMOKE_TEST_COMMAND: z.string().default('npm run test:smoke'),
  SMOKE_TIMEOUT_MS: z.coerce.number().default(300_000),
```

---

### `src/state/types.ts` (model, transform / schema)

**Analog:** `src/state/types.ts` lines 70-98 (`QaRunEntry`, `QaEvidenceState`) and lines 164-184 (`TicketState`)

**Type definition pattern**:
```typescript
export interface SmokeRunEntry {
  id?: number;
  runIndex: number;
  strikeCount: number;
  status: 'passed' | 'failed' | 'flaked';
  classification?: 'INFRA' | 'APP' | 'NONE';
  failedCheckSignatures?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface SmokeEvidenceState {
  status: 'passed' | 'failed' | 'flaked';
  classification?: 'INFRA' | 'APP' | 'NONE';
  commitSha: string;
  smokeUrl?: string | null;
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
  durationMs: number;
  flakeCleared: boolean;
  createdAt: string;
}

// Update TicketState interface:
export interface TicketState {
  // ... existing fields ...
  smokeRuns?: SmokeRunEntry[];
  smokeEvidence?: SmokeEvidenceState | null;
}
```

---

### `src/deploy/evidence-index.ts` (service, transform / aggregation)

**Analog:** `src/deploy/evidence-index.ts` lines 56-63, 91-94, 169-175, 270-275

**Composite L6 Evidence Aggregation pattern**:
```typescript
// In compileL1L7EvidenceIndex:
const smokeRecord = ticket.smokeEvidence ?? undefined;
const l6Record = ticket.telemetryEvaluations && ticket.telemetryEvaluations.length > 0
  ? ticket.telemetryEvaluations[ticket.telemetryEvaluations.length - 1]
  : undefined;

if (options?.failClosed === true) {
  // Require both smoke pass and telemetry pass
  if (!smokeRecord || smokeRecord.status === 'failed') {
    throw new MissingEvidenceError(`Missing or failed L6 smoke verification for #${workItemId}`, 'L6', workItemId);
  }
  if (!l6Record || l6Record.breached) {
    throw new MissingEvidenceError(`Missing or breached L6 telemetry record for #${workItemId}`, 'L6', workItemId);
  }
}
```

---

### `tests/deploy-smoke.test.ts` (test, request-response / assertion)

**Analogs:** `tests/qa-runner.test.ts` lines 1-65, 99-170 and `tests/deploy-telemetry.test.ts` lines 1-28

**Test Harness & Mocking pattern**:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import {
  probeProductionHealth,
  classifySmokeError,
  executeTwoStrikeSmokeFilter,
  formatSmokeAlertComment,
} from '../src/deploy/smoke.js';

describe('Production Smoke Suite (SMOKE-01, SMOKE-02, SMOKE-03)', () => {
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
  });
  // ...
});
```

---

### `tests/deploy-orchestrator.test.ts` (test, request-response / assertion)

**Analog:** `tests/deploy-orchestrator.test.ts` lines 159-255

**Fail-Fast Sequencing & Tag Verification pattern**:
```typescript
it('fails fast on smoke failure without evaluating telemetry window', async () => {
  const workItemId = 7401;
  // Mock ADO work item
  vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
    id: workItemId,
    rev: 5,
    fields: {
      'System.Title': 'Release with broken smoke',
      'System.State': 'Ready to Deploy',
      'System.Tags': '[deploying]',
    },
  } as any);

  const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({ id: workItemId } as any);

  // Mock failing smoke result
  await processDeploymentWorkflow(workItemId, 5, {
    skipPreparation: true,
    mockSmokeResult: { outcome: 'failed', classification: 'APP' },
    mockMetrics: { errorRatePercent: 0, p95LatencyMs: 100, totalRequests: 1000, failedRequests: 0, windowMinutes: 30 },
  });

  // Verify bounced to In Dev with [deploy-regressed]
  expect(updateSpy).toHaveBeenCalledWith(
    workItemId,
    expect.arrayContaining([
      expect.objectContaining({ path: '/fields/System.State', value: 'In Dev' }),
      expect.objectContaining({ path: '/fields/System.Tags', value: expect.stringContaining('[deploy-regressed]') }),
    ])
  );
});
```

---

## Shared Patterns

### Lane-Serialized StateStore Persistence
**Source:** `src/qa/runner.ts` lines 140-151 and `src/deploy/telemetry.ts` lines 153-169
**Apply to:** `src/deploy/smoke.ts`, `src/deploy/worker.ts`
```typescript
const mutate = async () => {
  await stateStore.updateTicketState(workItemId, (draft) => {
    // mutate draft safely
  });
};
if (laneContext.getStore()?.workItemId === workItemId) {
  await mutate();
} else {
  await workItemQueueManager.runInLane(workItemId, mutate);
}
```

### Sanitized Bot-Shielded HTML Comment
**Source:** `src/deploy/telemetry.ts` lines 182-233
**Apply to:** All comment formatters in `src/deploy/smoke.ts` and `src/deploy/worker.ts`
```typescript
const sanitized = sanitizeHtml(html, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'div', 'h3', 'h4', 'p', 'ul', 'li', 'strong', 'em', 'code', 'pre',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    div: ['class'],
  },
});
return `${sanitized}\n<!-- [automated-agent] -->`;
```

### Subprocess Execution with Secret Scrubbing
**Source:** `src/sandbox/runner.ts` lines 84-126
**Apply to:** Critical-path smoke script runner in `src/deploy/smoke.ts`
```typescript
const result = await runCommand(
  binary,
  args,
  { cwd: worktreePath, timeoutMs: env.SMOKE_TIMEOUT_MS },
  [env.ADO_PAT, env.OPENAI_API_KEY, env.ADO_WEBHOOK_SECRET]
);
```

### Error Signature Fingerprinting
**Source:** `src/qa/fingerprint.ts` lines 43-58
**Apply to:** Normalizing and comparing smoke error signatures in `src/deploy/smoke.ts`
```typescript
const failureFingerprints = extractFailureFingerprints(testFailures);
const comparison = compareFailures(run1.failures, run2.failures);
```

---

## No Analog Found

None. All files have exact or direct role/data flow analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/qa/`, `src/deploy/`, `src/sandbox/`, `src/state/`, `src/config/`, `tests/`
**Files scanned:** 12
**Pattern extraction date:** 2026-09-18
