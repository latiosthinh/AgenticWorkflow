---
phase: 05-prod-smoke-suite
verified: 2026-09-18T07:35:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
gaps: []
deferred: []
human_verification: []
---

# Phase 5: Prod Smoke Suite Verification Report

**Phase Goal:** An automated ⚡ production smoke suite (Release Step 8) runs BEFORE the telemetry window and feeds L6 — release confidence requires smoke PASS **and** telemetry-window PASS, with every run persisted to the ticket's `StateStore` smoke section.
**Verified:** 2026-09-18T07:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | On deployment, smoke runs first and fails fast — health probe, deployed version/SHA verification, critical-path checks via native fetch / sandboxed execa; telemetry window never opens on failure; missing `PRODUCTION_SMOKE_URL` in production fails closed | ✓ VERIFIED | `src/config/env.ts` parses `PRODUCTION_SMOKE_URL`, `SMOKE_TEST_COMMAND`, `SMOKE_TIMEOUT_MS`. `src/deploy/smoke.ts` `probeProductionHealth` throws in production on missing URL; verifies commit SHA from headers/body with stale slot swap detection. `src/deploy/worker.ts` invokes `processSmokeVerification` before telemetry and halts immediately if outcome is `'failed'`. Tested in `tests/deploy-smoke.test.ts` and `tests/deploy-orchestrator.test.ts`. |
| 2 | Smoke failures classify INFRA vs APP with a 2-strike deterministic-repro filter (`qa/fingerprint.ts` reused); ECONNRESET/timeout/4xx-auth/harness-crash -> INFRA; 5xx/SHA mismatch/test failure -> APP | ✓ VERIFIED | `src/deploy/smoke.ts` `classifySmokeError` categorizes error patterns. `executeTwoStrikeSmokeFilter` executes Run 1, reruns sequential Run 2 on failure, clears flake if Run 2 passes, and compares SHA-256 fingerprints via `compareFailures` if both fail. Tested in `tests/deploy-smoke.test.ts`. |
| 3 | Confirmed APP regression bounces ticket to `In Dev` with `[deploy-regressed]` + reproduction diagnostics + rollback command; INFRA error retains `Ready to Deploy` with `[smoke-harness-error]`; no auto-rollback | ✓ VERIFIED | `src/deploy/worker.ts` lines 269-331 builds tag patch removing `[deploying]` and adding `[deploy-regressed]` (`System.State: 'In Dev'`) or `[smoke-harness-error]` (`System.State` retained), posting formatted comment with loop shield `<!-- [automated-agent] -->`. Verified in `tests/deploy-smoke.test.ts` and `tests/deploy-orchestrator.test.ts`. |
| 4 | Runner is sandboxed and read-only via `runCommand` (`extendEnv:false`, scrubbed secrets, timeout ceiling <= 300,000ms); stdout/stderr sanitized before persisting or commenting | ✓ VERIFIED | `src/deploy/smoke.ts` `runSandboxedSmokeCommand` scrubs `ADO_PAT`, `OPENAI_API_KEY`, `ADO_WEBHOOK_SECRET`, caps timeout at 300,000ms, and passes `PRODUCTION_SMOKE_URL`. `formatSmokeAlertComment` sanitizes HTML using allowlisted tags. Tested in `tests/deploy-smoke.test.ts`. |
| 5 | Every run persists to StateStore (`smokeRuns`, `smokeEvidence`) serialized via `workItemQueueManager.runInLane` | ✓ VERIFIED | `src/deploy/smoke.ts` lines 388-416 records `SmokeRunEntry` and `SmokeEvidenceState` in `stateStore.updateTicketState` wrapped in `runInLane`. StateStore initializes `smokeRuns: []`. Verified in `tests/deploy-smoke.test.ts`. |
| 6 | Composite L6 evidence index aggregates smoke verification and telemetry; release confidence requires both smoke PASS and telemetry PASS | ✓ VERIFIED | `src/deploy/evidence-index.ts` lines 56-65, 118-120, 183-187, 287-292 compiles `smokePassed`, `smokeStatus`, `smokeChecksPassed`, `smokeChecksTotal`; throws `MissingEvidenceError` when `failClosed: true` and smoke failed; renders composite smoke + telemetry in L6 table row. `tests/deploy-orchestrator.test.ts` verifies Done transition requires dual pass. |

**Score:** 6/6 truths verified

### Deferred Items

None. All Phase 5 requirements delivered in this phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/config/env.ts` | Zod configuration for production smoke testing | ✓ VERIFIED | Substantive (34 LOC); adds `PRODUCTION_SMOKE_URL`, `SMOKE_TEST_COMMAND`, `SMOKE_TIMEOUT_MS` with defaults and type inference. |
| `src/state/types.ts` | `SmokeRunEntry` and `SmokeEvidenceState` interfaces | ✓ VERIFIED | Substantive; exports interfaces and extends `TicketState` with optional `smokeRuns` and `smokeEvidence`. |
| `src/state/store.ts` | `smokeRuns: []` initialization in default ticket creation | ✓ VERIFIED | Substantive; default ticket builder populates `smokeRuns: []`. |
| `src/deploy/smoke.ts` | Health probe, sandboxed execution, classifier, 2-strike filter, and alert formatter | ✓ VERIFIED | Substantive (614 LOC); exports `probeProductionHealth`, `runSandboxedSmokeCommand`, `runSmokeSuite`, `classifySmokeError`, `executeTwoStrikeSmokeFilter`, `formatSmokeAlertComment`. |
| `src/deploy/worker.ts` | Fail-fast smoke sequencing, tag patching, and telemetry gating | ✓ VERIFIED | Substantive (375 LOC); implements `processSmokeVerification` and fail-fast check in `processDeploymentWorkflow`. |
| `src/deploy/evidence-index.ts` | Composite L6 evidence aggregation and fail-closed gate | ✓ VERIFIED | Substantive (335 LOC); integrates smoke evidence into `compileL1L7EvidenceIndex` and `formatEvidenceIndexComment`. |
| `tests/deploy-smoke.test.ts` | Unit and integration tests for smoke suite, probe, flake filter, and state patching | ✓ VERIFIED | Substantive (886 LOC); 24 comprehensive tests passing. |
| `tests/deploy-orchestrator.test.ts` | Deployment orchestrator integration tests asserting fail-fast sequencing and composite L6 | ✓ VERIFIED | Substantive (652 LOC); 12 deployment lifecycle tests passing. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `src/deploy/smoke.ts` | `src/config/env.ts` | `import { env } from '../config/env.js'` | ✓ WIRED | Reads `PRODUCTION_SMOKE_URL`, `SMOKE_TEST_COMMAND`, `SMOKE_TIMEOUT_MS`. |
| `src/deploy/smoke.ts` | `src/sandbox/runner.ts` | `import { runCommand } from '../sandbox/runner.js'` | ✓ WIRED | Invokes `runCommand` with secret scrubbing and timeout ceiling. |
| `src/deploy/smoke.ts` | `src/qa/fingerprint.ts` | `import { extractFailureFingerprints, compareFailures }` | ✓ WIRED | Reuses SHA-256 fingerprint extractor and comparison for 2-strike filter. |
| `src/deploy/smoke.ts` | `src/state/index.ts` | `stateStore.updateTicketState` | ✓ WIRED | Updates `draft.smokeRuns` and `draft.smokeEvidence`. |
| `src/deploy/smoke.ts` | `src/queue/lane-manager.ts` | `workItemQueueManager.runInLane` / `laneContext` | ✓ WIRED | Enforces single-writer lane serialization for all state updates. |
| `src/deploy/worker.ts` | `src/deploy/smoke.ts` | `executeTwoStrikeSmokeFilter`, `formatSmokeAlertComment` | ✓ WIRED | Dispatches smoke verification and builds alert comments. |
| `src/deploy/worker.ts` | `src/ado/client.ts` | `adoClient.updateWorkItem` | ✓ WIRED | Patches state and tags (`[deploy-regressed]` / `[smoke-harness-error]`). |
| `src/deploy/evidence-index.ts` | `src/state/types.ts` | `ticket.smokeEvidence` | ✓ WIRED | Extracts smoke evidence and builds composite L6 record. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `src/deploy/smoke.ts` | `probe.actualSha` | Native fetch response headers (`x-commit-sha`, `x-version`) or JSON body | Real header / body values compared against expected commit SHA | ✓ FLOWING |
| `src/deploy/smoke.ts` | `cmdResult.failures` | Subprocess stdout/stderr via `parseSmokeFailures` | Real error headers and assertion error lines parsed | ✓ FLOWING |
| `src/deploy/smoke.ts` | `draft.smokeRuns` | `SmokeRunEntry` in `executeTwoStrikeSmokeFilter` | Real run index, strikes, failure signatures, stdout/stderr, durations | ✓ FLOWING |
| `src/deploy/smoke.ts` | `draft.smokeEvidence` | `SmokeEvidenceState` in `executeTwoStrikeSmokeFilter` | Real aggregate metrics: status, classification, checks passed/failed, duration | ✓ FLOWING |
| `src/deploy/evidence-index.ts` | `summary.l6` | `ticket.smokeEvidence` and `ticket.telemetryEvaluations` | Real composite status badge, checks count, and telemetry metrics | ✓ FLOWING |
| `src/deploy/worker.ts` | ADO History comment | `formatSmokeAlertComment` | Sanitized HTML with failure reasons, classification, and rollback instructions | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript static check | `npx tsc --noEmit` | Exit code 0, zero type errors | ✓ PASS |
| Smoke suite tests | `npx vitest run tests/deploy-smoke.test.ts` | 24 tests passed in 1.48s | ✓ PASS |
| Deploy orchestrator tests | `npx vitest run tests/deploy-orchestrator.test.ts` | 12 tests passed in 1.54s | ✓ PASS |
| Full regression test suite | `npm test` | 41 test files, 408 tests passed in 49.45s | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| `SMOKE-01` | `05-01-PLAN.md`, `05-02-PLAN.md`, `05-03-PLAN.md` | Automated production smoke suite runs BEFORE telemetry window (fail-fast); health probe, deployed version/SHA verification; sandboxed execution; fail-closed on missing URL in prod | ✓ SATISFIED | `src/config/env.ts:21-23`, `src/deploy/smoke.ts:46-139,145-221`, `src/deploy/worker.ts:356-367`, `tests/deploy-smoke.test.ts:17-214`, `tests/deploy-orchestrator.test.ts:343-403`. |
| `SMOKE-02` | `05-02-PLAN.md`, `05-03-PLAN.md` | Failures classify INFRA vs APP with 2-strike flake filter; confirmed APP regression bounces ticket to `In Dev` with `[deploy-regressed]` + reproduction diagnostics (no auto-rollback); INFRA retains `Ready to Deploy` with `[smoke-harness-error]` | ✓ SATISFIED | `src/deploy/smoke.ts:344-360,378-549,555-614`, `src/deploy/worker.ts:269-331`, `tests/deploy-smoke.test.ts:366-489,680-870`, `tests/deploy-orchestrator.test.ts:405-457`. |
| `SMOKE-03` | `05-01-PLAN.md`, `05-02-PLAN.md`, `05-03-PLAN.md` | Smoke results persist to ticket's `StateStore` record (`smokeRuns`, `smokeEvidence`) via `runInLane`; release confidence requires smoke PASS and telemetry PASS | ✓ SATISFIED | `src/state/types.ts:70-90,165-166`, `src/deploy/smoke.ts:388-416`, `src/deploy/evidence-index.ts:56-65,118-120,183-187`, `src/deploy/worker.ts:356-375`, `tests/deploy-smoke.test.ts:490-677`, `tests/deploy-orchestrator.test.ts:459-584`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | - | - | - | Zero TODO, FIXME, or stub returns found. Deliberate non-production fallback documented with `ponytail: fallback healthy stub in non-production environments when smoke URL unset`. |

### Human Verification Required

None. All probe logic, SHA verification, subprocess sandboxing, error classification, 2-strike flake filtering, ADO patch generation, fail-fast workflow sequencing, and composite evidence indexing are fully validated through deterministic Vitest test suites and TypeScript type checking.

### Gaps Summary

No gaps found. All success criteria and requirements (`SMOKE-01`, `SMOKE-02`, `SMOKE-03`) are implemented, wired, and verified with all 408 tests passing.

---

_Verified: 2026-09-18T07:35:00Z_
_Verifier: the agent (gsd-verifier)_
