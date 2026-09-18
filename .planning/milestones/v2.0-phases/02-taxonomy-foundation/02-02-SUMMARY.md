---
phase: 02-taxonomy-foundation
plan: 02
subsystem: orchestration
tags:
  - taxonomy
  - router
  - lifecycle-replay
  - ado
  - state-machine
dependency_graph:
  requires:
    - 02-01
  provides:
    - TAX-03
    - taxonomy-driven-routing
    - lifecycle-parity
  affects:
    - src/execute/router.ts
    - tests/lifecycle-replay.test.ts
tech_stack:
  added: []
  patterns:
    - taxonomy-step-resolution
    - lane-bound-router-dispatch
    - lifecycle-replay-parity
key_files:
  created:
    - tests/lifecycle-replay.test.ts
  modified:
    - src/execute/router.ts
decisions:
  - "[02-02]: Router state dispatch delegates to resolveRoutingStep from pipeline taxonomy using a step.step switch table"
  - "[02-02]: Wrap routeWorkItemEvent inside workItemQueueManager.runInLane to guarantee ambient lane context for all direct and routed state store mutations"
metrics:
  duration: 6m
  completed: 2026-09-17
---

# Phase 02 Plan 02: Taxonomy-Driven Router & Lifecycle Replay Parity Summary

Taxonomy-driven state dispatch in `src/execute/router.ts` using `resolveRoutingStep` with 100% v1.0 behavioral parity proven across all lifecycle states in `tests/lifecycle-replay.test.ts`.

## Implementation Overview

1. **Router State Dispatch Refactoring (`src/execute/router.ts`)**:
   - Integrated `resolveRoutingStep` from `src/pipeline/taxonomy.ts` to map incoming work item states and tags to canonical Golden Path v2 step definitions.
   - Maintained strict human acceptance verdict precedence (`reset_rework`, `approve`, `reject`) evaluating before state routing transitions.
   - Refactored transition execution to a `switch (step.step)` pattern (Step 1 audit, Step 3 execution, Step 4 Dev Done PR creation, Step 6 QA verification, Step 7 deployment workflow).
   - Preserved exact options forwarding across worker invocations and exact dedup skip strings (`Ticket state '${workItem.state}' has no active handler`).
   - Bound router execution inside `workItemQueueManager.runInLane(workItemId, ...)` to ensure guaranteed single-writer ambient lane context across all direct or nested mutations.

2. **Full Lifecycle Replay Parity Test Suite (`tests/lifecycle-replay.test.ts`)**:
   - Implemented end-to-end multi-revision fixture replay driving a work item through all 8 sequential revision events (`New` -> `Ready to Dev` -> `In Dev` -> `Dev Done` -> `[approve-acceptance]` -> `Ready for QA` -> `Ready to Deploy` -> `Done`).
   - Validated options forwarding to worker invocations and exact dedup statuses (`completed` vs `skipped`).
   - Verified human verdict precedence: `reset_rework` resets circuit breaker, `reject` dispatches rework worker while bypassing PR creation, and `approve` updates tags.
   - Verified unknown states and unhandled ADO client exceptions correctly update dedup events (`skipped` and `failed`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical Functionality] Bound router execution into dedicated queue lane**
- **Found during:** Task 2 integration test execution.
- **Issue:** Direct calls to `routeWorkItemEvent` outside ingress routes lacked ambient `laneContext`, causing `OffLaneMutationError` when state mutations were triggered.
- **Fix:** Wrapped `routeWorkItemEvent` body with `workItemQueueManager.runInLane(workItemId, async () => { ... })`. Leveraging `runInLane`'s existing re-entrancy check, existing callers inside an active lane execute immediately while direct callers safely obtain lane context.
- **Files modified:** `src/execute/router.ts`
- **Commit:** `cbae0a1`

## Verification Evidence

- `npx vitest run tests/lifecycle-replay.test.ts`: 6 tests passing (100%).
- `npm test`: 38 test files, 324 tests passing (100% green across entire repository).
- Self-check:
  - `src/execute/router.ts` exists and dispatches via `resolveRoutingStep`.
  - `tests/lifecycle-replay.test.ts` exists with 418 lines (exceeding 100-line requirement).
  - Commits `08c9e7c` and `cbae0a1` recorded in git history.

## Self-Check: PASSED
