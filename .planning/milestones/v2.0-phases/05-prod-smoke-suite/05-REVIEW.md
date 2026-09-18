---
phase: 05-prod-smoke-suite
reviewed: 2026-09-18T07:35:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/config/env.ts
  - src/deploy/smoke.ts
  - src/deploy/worker.ts
  - src/deploy/evidence-index.ts
  - src/state/types.ts
  - src/state/store.ts
  - tests/deploy-smoke.test.ts
  - tests/deploy-orchestrator.test.ts
  - tests/state-store.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-09-18T07:35:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 5 introduces production smoke verification suite: health probe, commit SHA matching for slot swaps, sandboxed subprocess runner, 2-strike flake filter, error classifier (INFRA vs APP), worker fail-fast sequencing before telemetry observation window, and composite L6 evidence indexing.

Review identified 4 warnings and 3 info findings. Key issues: commit SHA mismatch false positives when `commitSha` defaults to branch name `'main'`, potential `TypeError` in health probe body SHA extraction when non-string values present, double-counted duration in `runSmokeSuite`, and missing `PRODUCTION_SMOKE_URL` propagation in sandboxed subprocess environment.

## Critical Issues

None.

## Warnings

### WR-01: False-Positive Regression Bounce on Default Branch Name `commitSha = 'main'`

**File:** `src/deploy/smoke.ts:110-123`
**Issue:** `probeProductionHealth` checks `if (expectedSha && actualSha)` and compares 7-character prefixes. In `src/deploy/worker.ts:357`, `commitSha` defaults to `'main'` when `options?.commitSha` omitted (e.g. automated webhook routing). If production server returns valid git commit SHA (e.g. `abcdef1...`), prefix comparison against `'main'` fails. Probe returns `healthy: false, classification: 'APP'`. Deployment worker falsely treats healthy deployment as regression, bounces ticket to `In Dev` with `[deploy-regressed]`, and posts emergency rollback command.
**Fix:**
Skip SHA prefix verification if `expectedSha` not a valid hexadecimal git SHA or equal to `'main'`:
```typescript
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
```

### WR-02: Unhandled `TypeError` on Non-String Values in Health Probe Response Body

**File:** `src/deploy/smoke.ts:101-114`
**Issue:** `actualSha = body.commitSha || body.gitSha || body.version || actualSha;` reads unchecked JSON fields. If response JSON contains numeric `version: 1.0` or numeric `commitSha`, `actualSha` assigned number. `actualSha.startsWith(...)` throws `TypeError: actualSha.startsWith is not a function`. Error caught by outer `catch` block and misclassified as `INFRA: actualSha.startsWith is not a function`.
**Fix:**
Coerce extracted value to string and verify string type:
```typescript
    let actualSha = res.headers.get('x-commit-sha') || res.headers.get('x-version') || undefined;
    try {
      const body = await res.json();
      if (body && typeof body === 'object') {
        const raw = body.commitSha ?? body.gitSha ?? body.version;
        if (raw !== undefined && raw !== null) {
          actualSha = String(raw).trim();
        }
      }
    } catch {
      // Body not JSON; header fallback
    }
```

### WR-03: Double-Counted Subprocess Command Duration in `runSmokeSuite`

**File:** `src/deploy/smoke.ts:311-319`
**Issue:** `start` timestamp captured before `probeProductionHealth`. `runSandboxedSmokeCommand` runs between `start` and line 317. `(Date.now() - start)` already accounts for elapsed time of both probe and command. Adding `cmdResult.durationMs` double-counts subprocess execution time in reported duration.
**Fix:**
```typescript
  if (options.worktreePath) {
    const cmdResult = await runSandboxedSmokeCommand({
      worktreePath: options.worktreePath,
      command: options.testCommand,
    });
    return {
      ...cmdResult,
      durationMs: Date.now() - start,
    };
  }
```

### WR-04: Subprocess Runner Strips `PRODUCTION_SMOKE_URL` From Execution Environment

**File:** `src/deploy/smoke.ts:165-173`
**Issue:** `runSandboxedSmokeCommand` invokes `execFn(binary, args, { cwd, timeoutMs }, knownSecrets)`. `runner.ts` executes `runCommand` with `sanitizeEnv(options.env)` and `extendEnv: false`. Safe environment only keeps standard OS keys (`PATH`, `NODE_ENV`, etc.). `process.env.PRODUCTION_SMOKE_URL` stripped. Child process `npm run test:smoke` cannot access smoke endpoint URL.
**Fix:**
Pass target URL in `env` options:
```typescript
  const result = await execFn(
    binary,
    args,
    {
      cwd: options.worktreePath,
      timeoutMs,
      env: env.PRODUCTION_SMOKE_URL ? { PRODUCTION_SMOKE_URL: env.PRODUCTION_SMOKE_URL } : undefined,
    },
    knownSecrets
  );
```

## Info

### IN-01: Unbounded Error Lines in `parseSmokeFailures` Creating Bloated ADO Comments

**File:** `src/deploy/smoke.ts:252-277`, `src/deploy/worker.ts:272-277`
**Issue:** Stack traces with dozens of matching lines produce large arrays in `parseSmokeFailures`. `reasons.map(...)` renders all entries directly into HTML `<li>` list without limit, potentially overflowing ADO comment payload limits or polluting history.
**Fix:**
Cap error items in `processSmokeVerification` (e.g. `reasons = reasons.slice(0, 10)`).

### IN-02: `runSandboxedSmokeCommand` Unreachable in Standard `processDeploymentWorkflow`

**File:** `src/deploy/worker.ts:358-363`
**Issue:** `processDeploymentWorkflow` does not provision an ephemeral worktree or pass `worktreePath` to `processSmokeVerification`. As result, `runSmokeSuite` only executes `probeProductionHealth`. Subprocess runner `runSandboxedSmokeCommand` never runs in automated deployment pipeline.
**Fix:**
If smoke test scripts required alongside HTTP probe, provision ephemeral worktree using `createWorktree` (following `src/qa/worker.ts` pattern) and pass `worktreePath`.

### IN-03: `comparison.isIdentical` Computed but Unused in State Transition Logic

**File:** `src/deploy/smoke.ts:486-538`, `src/deploy/worker.ts:269-333`
**Issue:** Two-strike flake filter computes `comparison = compareFailures(fp1, fp2)` and returns `identicalFailures`. Worker branches strictly on `result.classification === 'APP'` without verifying `identicalFailures === true`.
**Fix:**
Add comment or check confirming whether differing APP failure signatures across strikes intentionally trigger rollback.

---

_Reviewed: 2026-09-18T07:35:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

## CODE REVIEW COMPLETE
