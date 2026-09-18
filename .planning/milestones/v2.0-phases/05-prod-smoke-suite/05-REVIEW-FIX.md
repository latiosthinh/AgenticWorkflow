---
phase: 05-prod-smoke-suite
fixed_at: 2026-09-18T07:26:00Z
review_path: .planning/phases/05-prod-smoke-suite/05-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-09-18T07:26:00Z
**Source review:** .planning/phases/05-prod-smoke-suite/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: False-Positive Regression Bounce on Default Branch Name `commitSha = 'main'`

**Files modified:** `src/deploy/smoke.ts`, `tests/deploy-smoke.test.ts`
**Commit:** 36f75d0
**Applied fix:** Checked `expectedSha` and `actualSha` with regex `/^[0-9a-f]{7,40}$/i` before performing SHA prefix mismatch comparison. Skips mismatch comparison when `expectedSha` is `'main'` or non-hex string.

### WR-02: Unhandled `TypeError` on Non-String Values in Health Probe Response Body

**Files modified:** `src/deploy/smoke.ts`, `tests/deploy-smoke.test.ts`
**Commit:** 407e1af
**Applied fix:** Coerced `body.commitSha`, `body.gitSha`, and `body.version` values to trimmed string via `String(raw).trim()` if present and non-null, preventing `TypeError` on `.toLowerCase().startsWith()` calls.

### WR-03: Double-Counted Subprocess Command Duration in `runSmokeSuite`

**Files modified:** `src/deploy/smoke.ts`, `tests/deploy-smoke.test.ts`
**Commit:** 46c0083
**Applied fix:** Changed returned `durationMs` to `Date.now() - start` instead of adding `cmdResult.durationMs` to total elapsed time. Added `commandRunnerFn` injection support for unit testing subprocess execution in `runSmokeSuite`.

### WR-04: Subprocess Runner Strips `PRODUCTION_SMOKE_URL` From Execution Environment

**Files modified:** `src/deploy/smoke.ts`, `tests/deploy-smoke.test.ts`
**Commit:** 2577cfe
**Applied fix:** Passed `options.smokeUrl || env.PRODUCTION_SMOKE_URL` as `PRODUCTION_SMOKE_URL` inside `env` object to `execFn` in `runSandboxedSmokeCommand`, allowing child smoke test scripts access to target deployment URL.

---

_Fixed: 2026-09-18T07:26:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
