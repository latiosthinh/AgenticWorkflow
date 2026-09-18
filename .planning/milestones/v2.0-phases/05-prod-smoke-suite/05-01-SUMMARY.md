---
phase: 05-prod-smoke-suite
plan: 01
subsystem: deploy
tags:
  - smoke-tests
  - health-probe
  - fail-closed
  - statestore
requires: []
provides:
  - SMOKE-01
  - SMOKE-03
key-files:
  created:
    - src/deploy/smoke.ts
    - tests/deploy-smoke.test.ts
  modified:
    - src/config/env.ts
    - src/state/types.ts
    - src/state/store.ts
    - tests/state-store.test.ts
decisions:
  - Enforce fail-closed check throwing descriptive error when PRODUCTION_SMOKE_URL is missing under NODE_ENV === 'production'
  - Verify commit SHA from response headers or JSON body with 7-character prefix match to detect stale slot swaps
  - Classify HTTP >= 500 as APP failures and HTTP 401/403 or network errors as INFRA failures
  - Initialize smokeRuns: [] in default TicketState creation in StateStore
metrics:
  duration: 4m
  completed_date: "2026-09-18"
---

# Phase 5 Plan 01: Prod Smoke Suite Configuration & Health Probe Summary

Production smoke test configuration schema, StateStore SmokeRunEntry and SmokeEvidenceState types, and core HTTP health probe with commit SHA verification and production fail-closed enforcement.

## Key Changes

1. **Smoke Environment Configuration (`src/config/env.ts`)**:
   - Added `PRODUCTION_SMOKE_URL` (optional valid URL schema).
   - Added `SMOKE_TEST_COMMAND` (string defaulting to `'npm run test:smoke'`).
   - Added `SMOKE_TIMEOUT_MS` (number defaulting to `300_000`).

2. **StateStore Schema Types & Initialization (`src/state/types.ts`, `src/state/store.ts`)**:
   - Defined and exported `SmokeRunEntry` interface with status (`passed`, `failed`, `flaked`), classification (`INFRA`, `APP`, `NONE`), run index, strike count, failure signatures, and stdout/stderr traces.
   - Defined and exported `SmokeEvidenceState` interface with checks counts, duration, flake cleared status, commit SHA, and smoke URL.
   - Added `smokeRuns` and `smokeEvidence` to `TicketState`.
   - Initialized `smokeRuns: []` in default `TicketState` creation in `FileStateStore.updateTicketState`.

3. **Core Health Probe & Commit SHA Verifier (`src/deploy/smoke.ts`)**:
   - Implemented `probeProductionHealth(url?: string, expectedSha?: string): Promise<HealthProbeResult>`.
   - Added fail-closed check throwing an error if `PRODUCTION_SMOKE_URL` is missing when `NODE_ENV === 'production'`.
   - Configured native `fetch` with `AbortController` (10s timeout) and `Accept: 'application/json'` header.
   - Handled non-200 responses: categorized HTTP >= 500 as `APP` and HTTP 401/403 as `INFRA`.
   - Extracted actual commit SHA from `x-commit-sha` or `x-version` headers, or body JSON fields (`commitSha`, `gitSha`, `version`).
   - Detected stale slot swaps when `expectedSha` prefix does not match `actualSha`, returning `APP` classification error.

4. **Test Coverage (`tests/deploy-smoke.test.ts`, `tests/state-store.test.ts`)**:
   - Added test suite verifying `probeProductionHealth` under 8 test scenarios: production fail-closed, test/dev fallback, HTTP 200 header SHA match, HTTP 200 body SHA match, HTTP 500 classification, HTTP 401/403 classification, network timeout/error classification, and stale slot swap detection.
   - Added test assertion for `smokeRuns: []` in `tests/state-store.test.ts`.

## Verification

- `npx vitest run tests/deploy-smoke.test.ts tests/state-store.test.ts`: Passed (19 tests).
- `npx vitest run`: Passed (41 test files, 381 tests).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `src/deploy/smoke.ts`: Non-production fallback stub (`{ healthy: true, status: 200, actualSha: expectedSha }`) when smoke URL is omitted in test/dev environment, marked with `ponytail: fallback healthy stub in non-production environments when smoke URL unset`.

## Self-Check: PASSED

- All files exist: `src/config/env.ts`, `src/state/types.ts`, `src/state/store.ts`, `src/deploy/smoke.ts`, `tests/deploy-smoke.test.ts`.
- Commits exist: `6d5b846`, `8aaf114`, `dd89a5b`, `74a7347`.
