# Phase 5: Prod Smoke Suite - Research

**Researched:** 2026-09-18
**Domain:** Automated Production Smoke Verification, Error Classification & Flake Filtering (Release Step 8 / L6)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Smoke Runner Mechanics
- **Fail-Fast Sequencing:** Smoke suite runs before telemetry evaluation. If smoke fails, release bounces without waiting for the 30-minute telemetry window.
- **Fail-Closed on Missing Config:** In production (`NODE_ENV === 'production'`), missing `PRODUCTION_SMOKE_URL` throws and fails closed. In development/test, fallback/mock URLs permitted.
- **Checks Executed:** Health endpoint probe (HTTP 200), deployed version / commit SHA verification (matches release commitSha to detect stale slot swaps), critical-path read checks.
- **2-Strike Flake Filter & Error Classification:** INFRA errors (ECONNRESET, connection timeout, 4xx auth error, harness crash) retry once; if failing twice, tag `[smoke-harness-error]` and keep state untouched for human review. APP errors (test failure, 5xx server error, SHA mismatch) retry once; if reproducible twice with identical fingerprint, bounce to `In Dev` with tag `[deploy-regressed]` and diagnostics.
- **Sandboxed Execution:** Scripted commands executed via `sandbox/runner.ts` (`extendEnv: false`, scrubbed secrets, hard timeout <= 5m, read-only).
- **StateStore Persistence:** Each smoke run appended to `draft.smokeRuns` or updated in `draft.smokeEvidence`.

### the agent's Discretion
None recorded.

### Deferred Ideas (OUT OF SCOPE)
- **GOV-01:** Automated canary traffic shifting with instant rollback.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMOKE-01 | On deployment (Release Step 8), the system runs an automated ⚡ production smoke suite BEFORE the telemetry window (fail-fast, don't burn 30 min on a dead deploy): health probe, deployed version/SHA verification (catches stale-slot swaps telemetry can't see), and critical-path read checks — via native `fetch` and/or sandboxed `execa` (read-only, credential-scrubbed, bounded timeout + egress). | Implemented via `src/deploy/smoke.ts` with native `fetch` probe, commit SHA validation, sandboxed `runCommand` from `src/sandbox/runner.ts`, environment schema validation in `src/config/env.ts`, and fail-fast sequencing in `src/deploy/worker.ts`. [VERIFIED: codebase inspection] |
| SMOKE-02 | Smoke failures classify INFRA vs APP with a 2-strike flake filter (reusing the QA fingerprint pattern) so a prod blip cannot trigger a false regression; a confirmed APP regression bounces the ticket to `In Dev` with `[deploy-regressed]` + reproduction diagnostics (no auto-rollback — GOV-01 deferred). | Implemented via error signature classification, SHA-256 fingerprinting from `src/qa/fingerprint.ts`, sequential 2-strike execution in `src/deploy/smoke.ts`, and tag/state branching (`[deploy-regressed]` to `In Dev` vs `[smoke-harness-error]` to `Ready to Deploy`) in `src/deploy/worker.ts`. [VERIFIED: `src/qa/fingerprint.ts`] |
| SMOKE-03 | Smoke results persist to the ticket's `StateStore` record (smoke section) and feed L6 Prod-Confidence evidence; release confidence requires smoke PASS **and** telemetry-window PASS. | Implemented via additive `smokeRuns` and `smokeEvidence` in `src/state/types.ts` and `src/state/store.ts`, lane-serialized persistence in `src/deploy/smoke.ts`, and composite L6 gate in `src/deploy/worker.ts`. [VERIFIED: `src/state/types.ts`] |
</phase_requirements>

## Summary

Phase 5 introduces an automated production smoke verification suite (Release Step 8) executed immediately after deployment preparation and before the 30-minute Azure Monitor telemetry observation window [CITED: `.planning/ROADMAP.md`]. The smoke suite acts as a fail-fast gate: if smoke checks fail, the release halts or bounces immediately rather than burning 30 minutes evaluating an already broken deployment [CITED: `05-CONTEXT.md`]. Release confidence (L6 evidence) requires both smoke PASS and telemetry PASS [CITED: `.planning/REQUIREMENTS.md`].

The smoke execution engine (`src/deploy/smoke.ts`) combines three verification layers: (1) native HTTP GET health probe (`fetch`), (2) deployed commit SHA verification against the release `commitSha` to prevent undetected stale slot swaps, and (3) sandboxed critical-path read tests executed through `src/sandbox/runner.ts` (`extendEnv: false`, credential scrubbing, hard timeout <= 5m, read-only assertion checks) [VERIFIED: `src/sandbox/runner.ts`]. When running in production (`NODE_ENV === 'production'`), missing `PRODUCTION_SMOKE_URL` fails closed and throws an error [CITED: `05-CONTEXT.md`].

To prevent production network blips from triggering false regressions, Phase 5 reuses the 2-strike deterministic flake filter pattern from `src/qa/fingerprint.ts` [VERIFIED: `src/qa/fingerprint.ts`]. Failures are strictly classified into INFRA (connection reset, timeout, 4xx auth error, harness crash) vs APP (test failure, 5xx server error, SHA mismatch). Confirmed APP regressions bounce the work item to `In Dev` with tag `[deploy-regressed]` and diagnostics. Confirmed INFRA errors keep the ticket parked in `Ready to Deploy` with tag `[smoke-harness-error]` for human operator intervention [CITED: `05-CONTEXT.md`]. Every run persists to `draft.smokeRuns` and `draft.smokeEvidence` in the ticket's file-backed `StateStore` [VERIFIED: `src/state/store.ts`].

**Primary recommendation:** Build `src/deploy/smoke.ts` reusing `sandbox/runner.ts` and `qa/fingerprint.ts`, add smoke config to `src/config/env.ts` and smoke types to `src/state/types.ts`, sequence smoke before telemetry in `src/deploy/worker.ts`, and verify with end-to-end tests in `tests/deploy-smoke.test.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP Health & Version Probe | API / Backend (`src/deploy/smoke.ts`) | Native `fetch` API | Direct HTTP GET probe with `AbortController` timeout; zero new libraries [VERIFIED: Node.js v24.0.2]. |
| Sandboxed Smoke Script Execution | Subprocess Sandbox (`src/sandbox/runner.ts`) | `execa` Process Engine | Isolated execution (`extendEnv: false`, scrubbed credentials, 5m timeout limit, memory cap) [VERIFIED: `src/sandbox/runner.ts`]. |
| Error Classification & Flake Filtering | API / Backend (`src/deploy/smoke.ts`) | QA Fingerprint Utility (`src/qa/fingerprint.ts`) | Normalizes error strings and compares SHA-256 hashes across 2 sequential strikes [VERIFIED: `src/qa/fingerprint.ts`]. |
| Smoke & Telemetry Sequencing | Deployment Orchestrator (`src/deploy/worker.ts`) | ADO REST Client (`src/ado/client.ts`) | Enforces fail-fast order: stage prep -> smoke suite -> telemetry window -> Done [CITED: `05-CONTEXT.md`]. |
| Smoke Evidence Persistence | Database / Storage (`data/state/tickets/<id>.md`) | StateStore API (`src/state/store.ts`) | Appends `draft.smokeRuns` and sets `draft.smokeEvidence` via `runInLane` [VERIFIED: `src/state/store.ts`]. |
| Regression / Harness Alerting | ADO Integration (`src/deploy/smoke.ts` / `src/ado/client.ts`) | sanitize-html library | Emits sanitized HTML comments with bot shield `<!-- [automated-agent] -->` [VERIFIED: `sanitize-html`]. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Node.js** | `v24.0.2` | Runtime environment | Host native runtime (`v24.0.2` verified). Native `fetch`, `AbortController`, `Web Streams`, ESM first. [VERIFIED: host environment] |
| **TypeScript** | `^7.0.2` | Language & type safety | End-to-end type safety across ADO JSON payloads, StateStore schemas, and smoke results. [VERIFIED: `package.json`] |
| **execa** | `^10.0.1` | Process & test execution | Modern process runner; handles timeouts, process tree termination, argument array safety, sanitized env. [VERIFIED: `package.json`] |
| **zod** | `^4.5.4` | Environment validation | Validates `PRODUCTION_SMOKE_URL`, `SMOKE_TEST_COMMAND`, `SMOKE_TIMEOUT_MS`. [VERIFIED: `package.json`] |
| **sanitize-html** | `^2.17.7` | HTML sanitization | Sanitizes diagnostic alert comments posted to ADO Work Item History. [VERIFIED: `package.json`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Vitest** | `^5.0.0` | Test runner | Unit and integration tests for smoke probes, error classifiers, and 2-strike filter. [VERIFIED: `package.json`] |
| **p-queue** | `^9.3.3` | Lane queue manager | Serializes ticket mutations through `workItemQueueManager.runInLane`. [VERIFIED: `package.json`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch` with `AbortController` | Axios or Got | Native fetch in Node 24 requires zero dependencies and supports abort signals cleanly. [VERIFIED: Node 24 docs] |
| Subprocess via `sandbox/runner.ts` | Direct `child_process.exec` | Native `exec` lacks signal cascade termination, leaks environment variables, and buffers unbounded output. [VERIFIED: `src/sandbox/runner.ts`] |
| Reusing `src/qa/fingerprint.ts` | New custom error normalizer | Reusing existing tested fingerprinting prevents code duplication and keeps hashing consistent. [VERIFIED: `src/qa/fingerprint.ts`] |

**Installation:**
No new dependencies required. Stack locked. Zero new packages [CITED: `.planning/ROADMAP.md`].

**Version verification:**
- Node: `v24.0.2` (Verified on host)
- npm: `11.19.1` (Verified on host)
- git: `2.53.0.windows.2` (Verified on host)
- vitest: `5.0.0` (Verified on host)

## Architecture Patterns

### System Architecture Diagram

```
[Ready to Deploy] Work Item Event
        │
        ▼
processDeploymentWorkflow() (src/deploy/worker.ts)
        │
        ├─► 1. processDeploymentPreparation() ──► L5 Readiness Packet + [deploying] tag
        │
        ▼
executeTwoStrikeSmokeFilter() (src/deploy/smoke.ts)
        │
        ├─► Run 1:
        │     ├─► Health probe: fetch(PRODUCTION_SMOKE_URL)
        │     ├─► Version verification: deployedSha === expectedSha
        │     └─► Critical-path read checks: runCommand(SMOKE_TEST_COMMAND)
        │
        ├─► Run 1 Passed? ──► Persist smokeEvidence (passed) ──► PROCEED TO TELEMETRY
        │
        └─► Run 1 Failed? ──► Record Run 1 failure fingerprint
              │
              ▼
        Sequential Run 2:
              ├─► Run 2 Passed? ──► Outcome: flaked (flake cleared) ──► PROCEED TO TELEMETRY
              │
              ▼
        Run 2 Failed (2nd Strike):
              ├─► Compare fingerprints (compareFailures)
              │
              ├─► Classify: INFRA vs APP
              │     │
              │     ├─► INFRA (ECONNRESET, timeout, 4xx auth, harness crash):
              │     │     ├─► Persist smokeEvidence (failed, INFRA)
              │     │     ├─► Tag [smoke-harness-error], keep state: Ready to Deploy
              │     │     ├─► Post harness alert comment
              │     │     └─► HALT RELEASE (Do not run telemetry, await human review)
              │     │
              │     └─► APP (5xx error, assertion failure, SHA mismatch):
              │           ├─► Persist smokeEvidence (failed, APP)
              │           ├─► Tag [deploy-regressed], bounce state: In Dev
              │           ├─► Post regression alert comment with rollback command
              │           └─► HALT RELEASE (Do not run telemetry, no auto-rollback)
              │
              ▼
processTelemetryEvaluation() (src/deploy/telemetry.ts)
        │
        ├─► Breached? ──► Tag [deploy-regressed], bounce state: In Dev
        │
        └─► Passed? ──► Compile L1-L7 Evidence Index ──► State: Done + [golden-path-complete]
```

### Recommended Project Structure
```
src/
├── config/
│   └── env.ts                 # Add PRODUCTION_SMOKE_URL, SMOKE_TEST_COMMAND, SMOKE_TIMEOUT_MS
├── state/
│   └── types.ts               # Add SmokeRunEntry, SmokeEvidenceState, update TicketState
├── deploy/
│   ├── smoke.ts               # NEW: health probe, SHA check, sandbox runner, 2-strike filter
│   ├── worker.ts              # Sequence smoke before telemetry evaluation
│   ├── telemetry.ts           # Existing telemetry monitor
│   └── evidence-index.ts      # Unified evidence index compiler
tests/
├── deploy-smoke.test.ts       # NEW: comprehensive smoke suite unit & integration tests
└── deploy-orchestrator.test.ts # Updated to assert smoke -> telemetry sequencing
```

### Pattern 1: Deterministic Smoke Runner & 2-Strike Flake Filter
**What:** Runs two sequential passes on failure, normalizes error strings to remove dynamic tokens (timestamps, ports, memory addresses), and compares SHA-256 error fingerprints.
**When to use:** Whenever evaluating external service health or critical-path assertions where transient network hiccups could trigger false alerts.
**Example:**
```typescript
// Source: src/deploy/smoke.ts (pattern adapted from src/qa/runner.ts)
export async function executeTwoStrikeSmokeFilter(options: {
  workItemId: number;
  commitSha: string;
  smokeUrl?: string;
  smokeCommand?: string;
  runnerFn?: (runIndex: number) => Promise<SmokeRunResult>;
}): Promise<TwoStrikeSmokeResult> {
  const run1 = options.runnerFn ? await options.runnerFn(1) : await runSmokeSuite(options);
  await recordSmokeRun(options.workItemId, run1, 1);

  if (run1.passed) {
    return { outcome: 'passed', firstRun: run1, flakeCleared: false };
  }

  // Sequential Rerun on initial failure
  const run2 = options.runnerFn ? await options.runnerFn(2) : await runSmokeSuite(options);
  if (run2.passed) {
    await recordSmokeRun(options.workItemId, run2, 2, 'flaked');
    return { outcome: 'flaked', firstRun: run1, secondRun: run2, flakeCleared: true };
  }

  const comparison = compareFailures(run1.failures, run2.failures);
  const classification = classifySmokeRunFailure(run1, run2);
  await recordSmokeRun(options.workItemId, run2, 2, 'failed', classification);

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

### Pattern 2: Fail-Fast Deploy Sequencing in worker.ts
**What:** Enforce strict sequential execution: L5 preparation -> Smoke suite -> Telemetry window -> Done transition.
**When to use:** In `processDeploymentWorkflow` in `src/deploy/worker.ts`.
**Example:**
```typescript
// Source: src/deploy/worker.ts
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

  // 3. Telemetry Evaluation (Only reached if smoke passed or flake cleared)
  await processTelemetryEvaluation(workItemId, {
    mockMetrics: options?.mockMetrics,
    windowMinutes: options?.windowMinutes,
    commitSha,
  });
}
```

### Pattern 3: INFRA vs APP Classification & ADO Tag Patching
**What:** INFRA errors (network resets, timeouts, 4xx auth errors, harness crashes) do not touch state and add `[smoke-harness-error]` for human review. APP errors (test assertion failure, 5xx server errors, SHA mismatches) bounce to `In Dev` with `[deploy-regressed]`.
**When to use:** Upon 2nd-strike smoke failure.

### Anti-Patterns to Avoid
- **Parallel Smoke and Telemetry Execution (Anti-Pattern 5):** Never trigger Azure Monitor telemetry concurrently with smoke testing. Smoke must fail fast within ~2-5 minutes; telemetry runs for 30 minutes. Parallel execution wastes compute and keeps a broken deploy active in production.
- **Silent Healthy Default in Production (Anti-Pattern 6):** If `PRODUCTION_SMOKE_URL` is omitted when `NODE_ENV === 'production'`, do NOT fall back to `{ healthy: true }`. Throw an error and fail closed.
- **Auto-Rollback on Regression:** GOV-01 is explicitly deferred. Do NOT execute automated git revert or traffic shifting. Bounce work item to `In Dev` with tag `[deploy-regressed]` and provide human-runnable rollback command in comments.
- **LLM Command Authoring for Smoke:** Never allow an LLM to generate ad-hoc commands against production endpoints. Smoke commands must be checked-in, deterministic read suites executed via `SMOKE_TEST_COMMAND`.
- **Off-Lane Mutations:** Persisting smoke runs or smoke evidence must route through `workItemQueueManager.runInLane(workItemId)` to guarantee the single-writer invariant on `data/state/tickets/<id>.md`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Subprocess Execution & Sandboxing | Custom `child_process.exec` | `src/sandbox/runner.ts` (`runCommand`) | Handles timeouts, force-kill cascades, environment variable sanitization, and output buffer truncation. [VERIFIED: `src/sandbox/runner.ts`] |
| Error Normalization & Hashing | Custom regex replaces and hashers | `src/qa/fingerprint.ts` (`extractFailureFingerprints`, `compareFailures`) | Strips ANSI escape codes, timestamps, ephemeral ports, memory addresses, and file paths; generates SHA-256 digests. [VERIFIED: `src/qa/fingerprint.ts`] |
| HTTP Probing | External HTTP libraries (`axios`, `got`) | Native `fetch` with `AbortController` | Built into Node 24 runtime; avoids adding dependencies to locked stack. [VERIFIED: Node v24.0.2] |
| Flake Filtering Logic | Ad-hoc rerun loops with sleep | Sequential 2-strike filter pattern from `src/qa/runner.ts` | Standardized 2-strike filter pattern proven in QA stage; keeps retry counts bounded to exactly 1 rerun. [VERIFIED: `src/qa/runner.ts`] |
| Diagnostic Sanitization | Regex HTML strippers | `sanitize-html` | Prevents XSS and broken markup in Azure DevOps Work Item History. [VERIFIED: `sanitize-html`] |

**Key insight:** All building blocks for sandboxing, error normalization, fingerprint hashing, and state persistence already exist in `src/sandbox/runner.ts`, `src/qa/fingerprint.ts`, and `src/state/store.ts`. Reusing these assets ensures zero new dependencies and consistent behavior across stages.

## Common Pitfalls

### Pitfall 1: Parallel Smoke and Telemetry Execution (Anti-Pattern 5)
**What goes wrong:** Deploy worker triggers telemetry observation at the same time as smoke testing. If smoke fails 2 minutes in, the telemetry monitor continues polling for 30 minutes before reporting the failure.
**Why it happens:** Developers treat smoke and telemetry as independent parallel checks.
**How to avoid:** In `processDeploymentWorkflow`, `await processSmokeVerification()` MUST complete and pass before `processTelemetryEvaluation()` is invoked.
**Warning signs:** Telemetry evaluation runs on tickets with failed smoke tests; total release step time on failure exceeds 5 minutes.

### Pitfall 2: Silent Healthy Fallback in Production (Anti-Pattern 6)
**What goes wrong:** Deployments succeed without any smoke checks run because `PRODUCTION_SMOKE_URL` was not configured in production environment.
**Why it happens:** Copying development fallback conventions (`url || defaultUrl`) without checking `NODE_ENV`.
**How to avoid:** In `src/deploy/smoke.ts`, assert: `if (!targetUrl && env.NODE_ENV === 'production') throw new Error('[smoke] PRODUCTION_SMOKE_URL is required in production (fail-closed)...')`.
**Warning signs:** Smoke passes in production with `durationMs: 0` and no HTTP requests logged.

### Pitfall 3: Stale Slot Swap Invisibility
**What goes wrong:** Staging/prod blue-green slot swap fails or lags, but smoke probe returns HTTP 200 from the *previous* deployment slot.
**Why it happens:** Probing `/health` only checks that the web server is alive, not that the new code was actually deployed.
**How to avoid:** Health probe must inspect response body or headers (`x-commit-sha`, `version`, `commitSha`) and assert equality against the target `commitSha`. A mismatch must be classified as an APP error (`APP_SHA_MISMATCH`).
**Warning signs:** Smoke passes on broken commit because it was verifying the previous healthy commit.

### Pitfall 4: Lane Queue Starvation During Smoke Execution
**What goes wrong:** Smoke command hangs or probe sleeps for minutes inside the per-ticket lane, blocking any other incoming webhooks or state updates for that ticket.
**Why it happens:** Setting excessive timeouts or placing long `setTimeout` calls inside `runInLane`.
**How to avoid:** Enforce hard timeout limit (`SMOKE_TIMEOUT_MS <= 300_000`, 5 mins maximum). Probe timeouts capped at 10 seconds.
**Warning signs:** Lane worker execution logs show tasks taking > 5 minutes.

### Pitfall 5: Production State Mutation via Non-Idempotent Smoke Commands
**What goes wrong:** Smoke command authors destructive actions (e.g. POST, DELETE, DB mutations) that pollute production data or corrupt live state.
**Why it happens:** Running integration test suites against production instead of dedicated read-only smoke checks.
**How to avoid:** Assert that `SMOKE_TEST_COMMAND` runs read-only suites; enforce test name and method inspection to reject mutating verbs; document that smoke checks are strictly read-only.
**Warning signs:** Production data modified by automated agent; customer complaints about test accounts or test data.

## Code Examples

### 1. HTTP Probe & Version Verification (`src/deploy/smoke.ts`)
```typescript
// Source: src/deploy/smoke.ts
export interface HealthProbeResult {
  healthy: boolean;
  status?: number;
  actualSha?: string;
  error?: string;
  classification?: 'INFRA' | 'APP';
}

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
    // Deterministic baseline for test/dev
    return { healthy: true, status: 200, actualSha: expectedSha };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeoutId);

    // 5xx indicates application server crash / unhandled exception
    if (res.status >= 500) {
      return {
        healthy: false,
        status: res.status,
        classification: 'APP',
        error: `Production health endpoint returned HTTP ${res.status}`,
      };
    }

    // 401 / 403 indicates harness authentication/credential failure
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

    // Version / Commit SHA verification
    let actualSha = res.headers.get('x-commit-sha') || res.headers.get('x-version') || undefined;
    try {
      const body = await res.json();
      if (body && typeof body === 'object') {
        actualSha = body.commitSha || body.gitSha || body.version || actualSha;
      }
    } catch {
      // Body not JSON; rely on headers
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
    // Network / timeout errors are INFRA failures
    return {
      healthy: false,
      classification: 'INFRA',
      error: err?.message || 'Failed to connect to production smoke endpoint',
    };
  }
}
```

### 2. Error Classifier: INFRA vs APP
```typescript
// Source: src/deploy/smoke.ts
export function classifySmokeError(
  errorMsg: string,
  statusCode?: number,
  timedOut?: boolean
): 'INFRA' | 'APP' {
  if (timedOut) return 'INFRA';
  if (statusCode === 401 || statusCode === 403) return 'INFRA';
  if (statusCode && statusCode >= 500) return 'APP';

  const infraPatterns = [
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /fetch failed/i,
    /socket hang up/i,
    /network timeout/i,
    /harness crash/i,
  ];

  for (const pattern of infraPatterns) {
    if (pattern.test(errorMsg)) {
      return 'INFRA';
    }
  }

  return 'APP';
}
```

### 3. StateStore Schema Extension (`src/state/types.ts`)
```typescript
// Source: src/state/types.ts
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

// Add to TicketState:
export interface TicketState {
  // ... existing fields ...
  smokeRuns?: SmokeRunEntry[];
  smokeEvidence?: SmokeEvidenceState | null;
}
```

### 4. Alert Comment Formatter with Shield
```typescript
// Source: src/deploy/smoke.ts
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

  const rollbackBlock = (!isInfra && rollbackCommand)
    ? `<h4>Emergency Rollback Command:</h4><pre><code>${sanitizeHtml(rollbackCommand)}</code></pre>`
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Relying solely on 30-min Azure Monitor telemetry (v1.0) | Active automated smoke suite runs BEFORE telemetry window (v2.0) | Milestone v2.0 (Golden Path v2) | Fails fast in ~2-5 minutes instead of burning 30 minutes on a dead release. [CITED: `05-CONTEXT.md`] |
| Probing status code only | Probing status code AND validating deployed commit SHA | Milestone v2.0 | Catches stale slot swaps where the blue-green swap failed but old slot reports HTTP 200. [CITED: `05-CONTEXT.md`] |
| Treating all smoke failures as code regressions | Classifying INFRA vs APP with 2-strike flake filter | Milestone v2.0 | Prevents transient connection resets or harness misconfigurations from falsely bouncing tickets to `In Dev`. [CITED: `05-CONTEXT.md`] |
| SQLite tables for smoke logs | Markdown frontmatter (`draft.smokeRuns`, `draft.smokeEvidence`) | Milestone v2.0 (Phase 1) | Zero database migrations, file-backed single-writer persistence. [VERIFIED: Phase 1] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default smoke test command is `npm run test:smoke` | Standard Stack / env.ts | Target repository must configure this script or specify `SMOKE_TEST_COMMAND` in env. Fallback handling exists. |

*Note:* All other technical specifications, schemas, and requirements in this document are [VERIFIED: codebase inspection] or [CITED: official planning documents].

## Open Questions (RESOLVED)

1. **Target-Repo vs Orchestrator-Owned Smoke Scripts**
   - What we know: `sandbox/runner.ts` can execute any command in any working directory.
   - What's unclear: Does the target application repo contain its own `npm run test:smoke` script, or does the orchestrator execute a standard HTTP probe suite?
   - RESOLVED: Default to native HTTP probe + version check directly in orchestrator; if `SMOKE_TEST_COMMAND` is specified and a worktree path is provided, execute sandboxed command in worktree.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Core runtime & fetch | ✓ | `v24.0.2` | — |
| npm | Package manager | ✓ | `11.19.1` | — |
| Git | Revision control & SHA | ✓ | `2.53.0` | — |
| Vitest | Test execution harness | ✓ | `5.0.0` | — |
| Azure DevOps API | Work item updates & tags | ✓ | `17.0.0` | In-memory mock in test env |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 [VERIFIED: `package.json`] |
| Config file | `vitest run` via npm scripts [VERIFIED: `package.json`] |
| Quick run command | `npx vitest run tests/deploy-smoke.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SMOKE-01 | Native fetch health probe, commit SHA verification, sandboxed command execution, fail-closed on missing URL in prod | unit / integration | `npx vitest run tests/deploy-smoke.test.ts -t "probeProductionHealth"` | ❌ Wave 0 Gap |
| SMOKE-01 | Smoke runs before telemetry evaluation; fails fast without waiting 30 min | integration | `npx vitest run tests/deploy-smoke.test.ts -t "processDeploymentWorkflow"` | ❌ Wave 0 Gap |
| SMOKE-02 | Error classification (INFRA vs APP) and 2-strike flake filtering | unit | `npx vitest run tests/deploy-smoke.test.ts -t "classifySmokeError"` | ❌ Wave 0 Gap |
| SMOKE-02 | APP regression bounces to In Dev with `[deploy-regressed]`; INFRA error stays Ready to Deploy with `[smoke-harness-error]` | integration | `npx vitest run tests/deploy-smoke.test.ts -t "two-strike filter"` | ❌ Wave 0 Gap |
| SMOKE-03 | Smoke runs and evidence persist to `TicketState` (`draft.smokeRuns`, `draft.smokeEvidence`) via `runInLane` | unit / integration | `npx vitest run tests/deploy-smoke.test.ts -t "StateStore persistence"` | ❌ Wave 0 Gap |
| SMOKE-03 | Release confidence requires both smoke PASS and telemetry PASS | integration | `npx vitest run tests/deploy-orchestrator.test.ts` | ✅ (Update required) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/deploy-smoke.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full test suite green (373+ tests passing) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/deploy-smoke.test.ts` — covers SMOKE-01, SMOKE-02, SMOKE-03
- [ ] `src/deploy/smoke.ts` — implementation of smoke runner, probe, SHA verifier, 2-strike filter, and alert formatter
- [ ] `src/config/env.ts` — add `PRODUCTION_SMOKE_URL`, `SMOKE_TEST_COMMAND`, `SMOKE_TIMEOUT_MS`
- [ ] `src/state/types.ts` — add `SmokeRunEntry`, `SmokeEvidenceState`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Scrub credentials (`ADO_PAT`, `OPENAI_API_KEY`, `ADO_WEBHOOK_SECRET`) from smoke runner logs; 4xx auth errors classified as INFRA harness issue [VERIFIED: `src/sandbox/runner.ts`]. |
| V3 Session Management | no | Orchestrator interacts with stateless health endpoints and webhook payloads. |
| V4 Access Control | yes | Native ADO Environment approval (L5) gates deployment; human verdict required before smoke suite triggers. |
| V5 Input Validation | yes | Zod validation for `PRODUCTION_SMOKE_URL` and smoke configuration in `src/config/env.ts`; `sanitize-html` for all ADO comment history postings. |
| V6 Cryptography | yes | SHA-256 error fingerprints generated using Node.js built-in `node:crypto`. |

### Known Threat Patterns for Node.js Smoke Runner

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via arbitrary smoke URL | Tampering / Information Disclosure | In production, `PRODUCTION_SMOKE_URL` is configured via trusted server environment variables, never from untrusted webhook payloads. [CITED: `05-CONTEXT.md`] |
| Shell Injection in Smoke Command | Tampering / Elevation of Privilege | Subprocess execution uses argument array (`execa(binary, args)`) with `shell: false` and `extendEnv: false` via `runCommand`. [VERIFIED: `src/sandbox/runner.ts`] |
| Secret Leaks in Smoke Failure Output | Information Disclosure | `scrubOutput` scrubs known secrets and regex token patterns before persisting to StateStore or posting comments. [VERIFIED: `src/sandbox/runner.ts`] |
| HTML Injection / Bot-Loop in Comments | Tampering | HTML sanitized via `sanitize-html` with strict tag allowlist; appended with `<!-- [automated-agent] -->` shield. [VERIFIED: `src/deploy/telemetry.ts`] |

## Sources

### Primary (HIGH confidence)
- `src/sandbox/runner.ts` - Subprocess runner with environment sanitization, timeouts, and secret redaction
- `src/qa/fingerprint.ts` - Failure fingerprint normalization and SHA-256 comparison
- `src/qa/runner.ts` - Two-strike flake filter pattern
- `src/deploy/telemetry.ts` - Production telemetry evaluation and alert comment formatting
- `src/deploy/worker.ts` - Deployment workflow orchestration
- `src/state/types.ts` & `src/state/store.ts` - File-backed StateStore and TicketState persistence
- `.planning/phases/05-prod-smoke-suite/05-CONTEXT.md` - Phase 5 decisions and boundaries
- `.planning/REQUIREMENTS.md` - Milestone v2.0 requirements (SMOKE-01, SMOKE-02, SMOKE-03)
- `.planning/ROADMAP.md` - Phase 5 scope, success criteria, and wave sequencing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zero new dependencies; builds directly on Node 24 native fetch and existing execa / vitest / zod stack.
- Architecture: HIGH - Follows established QA two-strike filter and deployment telemetry worker patterns.
- Pitfalls: HIGH - All pitfalls and anti-patterns mapped directly from ROADMAP and existing code invariants.

**Research date:** 2026-09-18
**Valid until:** 2026-10-18 (stable architecture)
