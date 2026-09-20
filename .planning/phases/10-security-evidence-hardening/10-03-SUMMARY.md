---
phase: 10-security-evidence-hardening
plan: 03
subsystem: security
tags:
  - security
  - evidence-integrity
  - zero-fabrication
  - secret-scrubbing
  - core-04
  - rel-09
dependency_graph:
  requires:
    - 10-01
    - 10-02
  provides:
    - zero-fabricated-evidence-enforcement
    - fail-closed-router-l3-requirement
    - real-git-commit-resolution-qa
    - honest-evidence-index-compiler
    - repair-loop-known-secrets-scrubbing
  affects:
    - src/execute/router.ts
    - src/qa/worker.ts
    - src/deploy/evidence-index.ts
    - src/state/types.ts
    - src/ado/work-item.ts
    - src/sandbox/runner.ts
    - src/execute/worker.ts
    - src/execute/rework-worker.ts
    - src/execute/repair.ts
tech_stack:
  added: []
  patterns:
    - fail-closed L3 evidence checking with MissingEvidenceError in router step 4
    - dynamic git rev-parse HEAD resolution in QA worktree with qa-harness-error state transition
    - strict evidence index compilation requiring real L2/L4/L6 records under failClosed: true
    - centralized getKnownSecrets helper and 52-char raw ADO PAT pattern scrubbing
    - defense-in-depth secret scrubbing on repair loop diagnostics
key_files:
  created:
    - tests/honest-evidence.test.ts
    - tests/repair-secrets.test.ts
  modified:
    - src/execute/router.ts
    - src/qa/worker.ts
    - src/deploy/evidence-index.ts
    - src/state/types.ts
    - src/ado/work-item.ts
    - src/sandbox/runner.ts
    - src/execute/worker.ts
    - src/execute/rework-worker.ts
    - src/execute/repair.ts
    - tests/deploy-evidence-index.test.ts
    - tests/deploy-orchestrator.test.ts
    - tests/lifecycle-replay.test.ts
decisions:
  - "Router step 4 throws MissingEvidenceError when ticket lacks real L3 evidence, flags ticket Blocked in ADO, and marks dedup status failed."
  - "QA worker resolves commit SHA via git rev-parse HEAD in worktree (or branch ref), never hardcoding 'main', and transitions to Blocked with [qa-harness-error] when unresolved."
  - "compileL1L7EvidenceIndex enforces real L2, L4, and L6 telemetry metrics (errorRate and p95LatencyMs) under failClosed: true, eliminating hardcoded constants '0.05%' and 145."
  - "compileL1L7EvidenceIndex defaults gracefully to 'Pending' / 0 metrics when failClosed is false instead of fabricating pass states."
  - "Router step 4 records real l2Evidence upon PR creation, and acceptance approval records real l4Evidence upon gate sign-off."
  - "getKnownSecrets aggregates ADO PAT, webhook secret, API key, and OpenAI key; SENSITIVE_VALUE_PATTERN scrubs raw 52-char ADO PATs."
  - "executeRepairLoop accepts knownSecrets and scrubs returned test diagnostics before emission."
metrics:
  duration: 15 min
  completed_date: "2026-09-20"
---

# Phase 10 Plan 03: Zero Fabricated Evidence & Secret Scrubbing Summary

Eliminated all fabricated evidence defaults across router, QA worker, and evidence index (CORE-04), and enforced known secret scrubbing in repair loops and sandboxes (REL-09).

## Key Deliverables

### 1. Zero Fabricated Evidence in Router, QA, and Evidence Index (CORE-04)
- **Router Step 4 Fail-Closed**: In `src/execute/router.ts`, step 4 checks `ticket.l3Evidence`. If absent, it flags the ticket Blocked in ADO with a sanitized alert comment, sets dedup status to `failed`, and throws `MissingEvidenceError`. Removed `{ suite: 'vitest', totalTests: 1, passed: 1 }` fallback.
- **QA Worker Real Git Resolution**: In `src/qa/worker.ts`, replaced hardcoded `let commitSha = 'main'` with `git.raw(['rev-parse', 'HEAD'])` within `worktreePath` (falling back to work item branch ref). If commit SHA cannot be resolved, fails closed by transitioning ticket to Blocked with `[qa-harness-error]` and returning early.
- **Honest Evidence Index Compiler**: In `src/deploy/evidence-index.ts`, updated `compileL1L7EvidenceIndex`:
  - When `options?.failClosed === true`: Requires real `l2Evidence` (`options?.l2Evidence ?? ticket.l2Evidence`), `l4Evidence` (`options?.l4Evidence ?? ticket.l4Evidence`), and non-empty L6 telemetry metrics (`errorRate` and `p95LatencyMs`). Throws `MissingEvidenceError` if any are missing.
  - When `options?.failClosed !== true`: Gracefully defaults to `Pending` / 0 without fabricating `'PASSED'` or constants `'0.05%'` / `145`.
- **Pipeline Stage Evidence Recording**: In `src/execute/router.ts`, step 4 records `l2Evidence` upon PR creation, and Step 5 acceptance approval records `l4Evidence` upon authorized sign-off.
- **Added `tests/honest-evidence.test.ts`**: Verifies step 4 L3 requirement, QA worker rev-parse resolution with `[qa-harness-error]` fail-closed handling, and evidence index fail-closed validation.

### 2. Known Secrets Scrubbing in Repair Loops & Sandboxes (REL-09)
- **Centralized `getKnownSecrets` Helper**: In `src/sandbox/runner.ts`, exports `getKnownSecrets(): string[]` returning active secrets (`ADO_PAT`, `ADO_WEBHOOK_SECRET`, `API_KEY`, `OPENAI_API_KEY`).
- **Enhanced `SENSITIVE_VALUE_PATTERN`**: Updated pattern to match raw 52-character ADO PATs `/(?:ghp_[a-zA-Z0-9]{36}|Bearer\s+[a-zA-Z0-9_\-\.]+|ado-[a-zA-Z0-9]{40,}|[a-zA-Z0-9]{52})/g`.
- **Worker Known Secrets Propagation**: In `src/execute/worker.ts` and `src/execute/rework-worker.ts`, passed `knownSecrets: getKnownSecrets()` to `executeRepairLoop`.
- **Diagnostic Output Scrubbing**: In `src/execute/repair.ts`, wrapped returned diagnostics with `scrubOutput(rawDiagnostics, options.knownSecrets)`.
- **Added `tests/repair-secrets.test.ts`**: Verifies `getKnownSecrets()`, raw 52-character PAT scrubbing, Bearer token scrubbing, explicit secret scrubbing, and `executeRepairLoop` diagnostic scrubbing.

## Verification Results

Targeted tests:
- `tests/honest-evidence.test.ts`: 9/9 tests passed
- `tests/repair-secrets.test.ts`: 6/6 tests passed
- `tests/deploy-evidence-index.test.ts`: 16/16 tests passed

Full test suite:
- `npm test`: 59 test files, 582/582 tests passed (0 failures, 0 skipped)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Scoped actor variable in router Step 5 acceptance verdict approval**
- **Found during:** Task 1 test run (`tests/lifecycle-replay.test.ts`)
- **Issue:** `sanitizedActor` was locally scoped to the `unauthorized` branch in `router.ts`, causing a `ReferenceError` when referenced in the `approve` branch.
- **Fix:** Defined `actor` locally in the `approve` branch using `verdict.actor || workItem.revisedBy || 'human-reviewer'`.
- **Files modified:** `src/execute/router.ts`
- **Commit:** `ff81a1d`

**2. [Rule 2 - Missing Critical Functionality] Updated baseline test seeds with L2/L4 evidence**
- **Found during:** Task 1 baseline audit
- **Issue:** Baseline tests in `deploy-orchestrator.test.ts` called `compileL1L7EvidenceIndex(..., { failClosed: true })` without L2/L4 records, which would fail closed under the new strict compiler.
- **Fix:** Updated `seedStandardPassingEvidence` in `deploy-orchestrator.test.ts` and `seedCompleteTicket` in `deploy-evidence-index.test.ts` with valid L2/L4 evidence.
- **Files modified:** `tests/deploy-evidence-index.test.ts`, `tests/deploy-orchestrator.test.ts`
- **Commit:** `ff81a1d`

## Commits

- `ff81a1d`: feat(10-03): zero fabricated evidence in router, QA, and evidence index (CORE-04)
- `0772ebb`: feat(10-03): known secrets scrubbing in repair loop & sandboxes (REL-09)

## Self-Check: PASSED
- Artifact `src/execute/router.ts` exists and throws MissingEvidenceError on missing L3 evidence
- Artifact `src/qa/worker.ts` exists and resolves commit SHA via rev-parse HEAD with [qa-harness-error]
- Artifact `src/deploy/evidence-index.ts` exists and strictly compiles evidence without constants
- Artifact `src/sandbox/runner.ts` exists and exports getKnownSecrets
- Artifact `src/execute/repair.ts` exists and scrubs diagnostics
- Test file `tests/honest-evidence.test.ts` exists
- Test file `tests/repair-secrets.test.ts` exists
- Commit `ff81a1d` verified in git log
- Commit `0772ebb` verified in git log
