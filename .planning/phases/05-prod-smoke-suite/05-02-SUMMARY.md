---
phase: 05-prod-smoke-suite
plan: 02
subsystem: deploy
tags: [smoke, sandboxing, flake-filter, error-classification, statestore, alerts]
requires:
  - 05-01
provides:
  - sandboxed-smoke-execution
  - two-strike-smoke-filter
  - smoke-error-classification
  - smoke-alert-formatting
affects:
  - src/deploy/smoke.ts
  - tests/deploy-smoke.test.ts
tech-stack:
  added: []
  patterns:
    - subprocess-execution-secret-scrubbing
    - two-strike-flake-filter
    - error-signature-classification
    - sanitized-bot-shielded-html-comment
key-files:
  created: []
  modified:
    - src/deploy/smoke.ts
    - tests/deploy-smoke.test.ts
decisions:
  - "Clamp smoke execution timeout to Math.min(timeoutMs, 300_000) with extendEnv: false and scrub known tokens (ADO_PAT, OPENAI_API_KEY, ADO_WEBHOOK_SECRET)"
  - "Classify smoke failures into INFRA (timeouts, 401/403, socket hang up, ECONNRESET) vs APP (>= 500, SHA mismatch, test assertions) to protect release stability"
  - "Apply two-strike flake filter: clear flake on sequential run 2 success; compare SHA-256 fingerprints on run 2 failure to confirm regression"
  - "Persist smokeRuns and smokeEvidence to FileStateStore serialized via workItemQueueManager.runInLane"
metrics:
  duration: 4m
  completed: "2026-09-18"
---

# Phase 5 Plan 02: Sandboxed Smoke Execution & 2-Strike Flake Filter Summary

Sandboxed subprocess smoke execution, strict INFRA vs APP error signature classification, two-strike flake filter with SHA-256 fingerprint comparison, FileStateStore persistence, and sanitized bot-shielded ADO alert comments.

## Overview

Plan 05-02 implements the core smoke verification engine in `src/deploy/smoke.ts` and comprehensive test coverage in `tests/deploy-smoke.test.ts`:
1. **Sandboxed Subprocess Execution:** `runSandboxedSmokeCommand` invokes `runCommand` with argument array splitting (`shell: false`), `extendEnv: false`, known secrets scrubbing (`ADO_PAT`, `OPENAI_API_KEY`, `ADO_WEBHOOK_SECRET`), and hard timeout ceiling capped at 300,000ms.
2. **Failure Extraction:** Parses command stdout/stderr into structured `TestFailure` records containing `testFile`, `testName`, and `errorMessage`.
3. **Error Classification:** `classifySmokeError` deterministically separates INFRA failures (network connection resets, timeouts, 401/403 auth errors, socket hang ups, harness crashes) from APP regressions (>= 500 server errors, SHA mismatches, test assertion failures).
4. **Two-Strike Flake Filter:** `executeTwoStrikeSmokeFilter` executes Run 1. On pass, records success and updates `draft.smokeEvidence`. On failure, executes sequential Run 2: if Run 2 passes, clears flake (`outcome: 'flaked'`, `flakeCleared: true`); if Run 2 fails, runs `compareFailures` on SHA-256 fingerprints to verify regression reproducibility and updates `draft.smokeEvidence` with classification.
5. **StateStore Single-Writer Mutations:** All mutations to `draft.smokeRuns` and `draft.smokeEvidence` are serialized via `workItemQueueManager.runInLane` or ambient `laneContext`.
6. **Sanitized Alert Comments:** `formatSmokeAlertComment` formats safe HTML with allowlisted tags and div class, emergency rollback instructions for APP regressions (omitted for INFRA harness errors), and appends loop shield `<!-- [automated-agent] -->` to prevent webhook feedback loops.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement sandboxed smoke script execution and failure parser | 51b56b3 | src/deploy/smoke.ts, tests/deploy-smoke.test.ts |
| 2 | Implement error classifier, two-strike flake filter, StateStore persistence, and alert formatter | 7c5d36b | src/deploy/smoke.ts, tests/deploy-smoke.test.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

Ran full test suite:
- `npx vitest run tests/deploy-smoke.test.ts -t "runSandboxedSmokeCommand"`: 4 passed
- `npx vitest run tests/deploy-smoke.test.ts`: 23 passed (100% pass rate)
- `npx vitest run`: 41 test files passed, 396 tests passed

## Self-Check: PASSED

- `src/deploy/smoke.ts`: FOUND
- `tests/deploy-smoke.test.ts`: FOUND
- Commit `51b56b3`: FOUND
- Commit `7c5d36b`: FOUND
