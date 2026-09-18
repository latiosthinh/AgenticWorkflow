---
phase: 05-prod-smoke-suite
plan: 03
subsystem: deploy
tags:
  - smoke
  - telemetry
  - fail-fast
  - l6-evidence
  - deployment-worker
dependency_graph:
  requires:
    - 05-01
    - 05-02
  provides:
    - smoke-fail-fast-sequencing
    - composite-l6-evidence-index
  affects:
    - src/deploy/worker.ts
    - src/deploy/evidence-index.ts
tech_stack:
  added: []
  patterns:
    - fail-fast sequential gates
    - tag-based error branching
    - composite evidence indexing
key_files:
  created: []
  modified:
    - src/deploy/worker.ts
    - src/deploy/evidence-index.ts
    - tests/deploy-smoke.test.ts
    - tests/deploy-orchestrator.test.ts
decisions:
  - fail-fast smoke verification executed before opening 30-minute telemetry observation window
  - APP smoke regressions bounce work item to In Dev with tag [deploy-regressed] and emergency rollback command
  - INFRA smoke errors park work item in Ready to Deploy with tag [smoke-harness-error] for human operator review
  - composite L6 evidence index aggregates both smoke verification status and telemetry observation metrics
metrics:
  duration: 5m
  completed_date: "2026-09-18"
requirements:
  - SMOKE-01
  - SMOKE-02
  - SMOKE-03
---

# Phase 5 Plan 3: Worker Fail-Fast Sequencing & L6 Index Summary

Wire automated production smoke verification into deployment worker with fail-fast sequencing before telemetry observation window, tag-based state branching for APP vs INFRA failures, and composite L6 evidence index compilation.

## Accomplishments

1. **Fail-Fast Smoke Sequencing (`src/deploy/worker.ts`)**:
   - Integrated `processSmokeVerification` into `processDeploymentWorkflow` immediately after stage preparation and prior to `processTelemetryEvaluation`.
   - Halts deployment workflow immediately if smoke outcome is `'failed'`, preventing 30-minute observation window burn on dead releases.
   - Proceeds to telemetry evaluation only when smoke verification passes or flake is cleared.

2. **Tag-Based State Branching (`src/deploy/worker.ts`)**:
   - **APP Failures**: Patches `System.State` to `'In Dev'`, replaces `[deploying]` with `[deploy-regressed]`, and posts formatted alert comment with emergency rollback command.
   - **INFRA Errors**: Retains `System.State` in `'Ready to Deploy'`, replaces `[deploying]` with `[smoke-harness-error]`, and posts formatted harness alert comment for operator intervention.

3. **Composite L6 Evidence Aggregation (`src/deploy/evidence-index.ts`)**:
   - Added `smokePassed`, `smokeStatus`, `smokeChecksPassed`, and `smokeChecksTotal` to `L1L7EvidenceSummary['l6']`.
   - Enforced fail-closed validation throwing `MissingEvidenceError` when `failClosed: true` and smoke status is `'failed'`.
   - Updated `formatEvidenceIndexComment` to render smoke status badge and checks count alongside 30-minute observation metrics in L6 table row.

4. **Automated Verification Coverage**:
   - `tests/deploy-smoke.test.ts`: Added tests verifying APP regression bounces, INFRA error parking, and passing/flaked non-bouncing workflows.
   - `tests/deploy-orchestrator.test.ts`: Added tests verifying fail-fast workflow halt, state and tag branching, Done transition on dual pass, composite L6 summary fields, and fail-closed error throwing.
   - Full test suite passing (41 test files, 404 tests).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all evidence extraction, ADO patching, and sequencing are fully wired.

## Threat Register Realization

- **T-05-08 (Tampering)**: Mitigated by sequential execution of `processSmokeVerification` before telemetry. If smoke verification fails, telemetry evaluation is bypassed entirely.
- **T-05-09 (Repudiation)**: Mitigated by composite L6 evidence capturing both smoke execution status and telemetry observation metrics in StateStore and formatted comments.
- **T-05-10 (Denial of Service)**: Mitigated by fail-fast return on smoke failure, preventing unneeded 30-minute polling cycles on broken releases.

## Self-Check: PASSED
