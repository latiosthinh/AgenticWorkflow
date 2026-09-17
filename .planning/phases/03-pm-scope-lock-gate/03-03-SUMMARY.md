---
phase: 03-pm-scope-lock-gate
plan: 03
subsystem: scope
tags:
  - scope-lock
  - watchdog
  - reconciler
  - router-guard
  - lifecycle-replay
  - state-store
dependency_graph:
  requires:
    - 03-02
  provides:
    - SCOPE-02
    - SCOPE-03
    - scope-watchdog-service
    - ado-reconciler
    - router-scope-guard
    - server-watchdog-lifecycle
  affects:
    - src/scope/watchdog.ts
    - src/scope/index.ts
    - src/execute/router.ts
    - src/index.ts
    - tests/lifecycle-replay.test.ts
    - tests/scope-gate.test.ts
    - tests/plan-checkpoint.test.ts
tech_stack:
  added: []
  patterns:
    - periodic-batch-scanner
    - webhook-drop-reconciliation
    - fail-closed-router-guard
    - graceful-shutdown-teardown
key_files:
  created:
    - src/scope/watchdog.ts
    - src/scope/index.ts
  modified:
    - src/execute/router.ts
    - src/index.ts
    - tests/lifecycle-replay.test.ts
    - tests/scope-gate.test.ts
    - tests/plan-checkpoint.test.ts
decisions:
  - "[03-03]: Scope watchdog scans pending tickets on interval, posting 24h reminders and escalating tickets pending over 72h to Blocked with [scope-unresolved]"
  - "[03-03]: Scope watchdog reconciles dropped webhooks by checking ADO state for Ready to Dev or [scope-locked] tag, updating StateStore to locked without reminder/escalation"
  - "[03-03]: Router enforces fail-closed scope check at Step 3 In Dev, refusing dispatch with dedup status 'skipped' when scopeLock.status is not 'locked'"
  - "[03-03]: Scope watchdog lifecycle wired into Fastify server startup and graceful shutdown alongside plan watchdog"
metrics:
  duration: 8m
  completed: 2026-09-17
---

# Phase 03 Plan 03: Scope Watchdog, Router Step 3 Guard, Lifecycle Replay, and Service Wiring Summary

Background scope watchdog with ADO drop reconciliation (SCOPE-02) and fail-closed router Step 3 In Dev scope enforcement (SCOPE-03) with end-to-end lifecycle replay verification.

## Implementation Overview

1. **Background Scope Watchdog & Live ADO Reconciler (`src/scope/watchdog.ts`, `src/scope/index.ts`)**:
   - Implemented `checkScopeLockTimeouts`:
     - Discovers active tickets pending PM scope lock via `stateStore.listTickets()`.
     - Queries ADO work item to reconcile dropped webhooks if human moved card to `Ready to Dev` or tagged `[scope-locked]` directly on board, updating StateStore to `locked`.
     - Sweeps elapsed duration against `SEVENTY_TWO_HOURS_MS` (72h): escalates to `Blocked`, applies `[scope-unresolved]` tag, removes `[awaiting-scope-lock]`, and posts escalation comment with loop shield `<!-- [automated-agent] -->`.
     - Sweeps elapsed duration against `TWENTY_FOUR_HOURS_MS` (24h): posts reminder comment to ADO and marks `remindedAt` to prevent duplicate comment storms.
     - Operates each mutation inside `workItemQueueManager.runInLane` for single-writer concurrency safety.
   - Implemented `startScopeWatchdog` interval timer with clean `stop()` handle.
   - Created barrel export `src/scope/index.ts`.

2. **Router Scope Verdict Dispatch & Fail-Closed Step 3 Guard (`src/execute/router.ts`)**:
   - Wired `detectScopeVerdict` in `routeWorkItemEvent` before acceptance verdicts:
     - Routes `[approve-scope]` / `New` -> `Ready to Dev` to `handleScopeApproval`.
     - Routes `[reject-scope]` / `[scope-rejected]` to `handleScopeRejection` (driving the isolated refinement circuit breaker).
     - Routes `[reset-scope]` to `resetScopeBreaker`.
   - Enforced fail-closed scope check in Step 3 (`case 3`):
     - Inspects `ticket?.scopeLock?.status !== 'locked'`.
     - Refuses dispatch, sets dedup status to `'skipped'` with detailed reason, and halts execution before spawning worker or allocating worktrees (mitigating T-03-07).

3. **Server Lifecycle Management (`src/index.ts`)**:
   - Started `startScopeWatchdog()` during server startup.
   - Added `scopeWatchdog.stop()` in `gracefulShutdown()` alongside plan watchdog for clean teardown on SIGINT/SIGTERM (mitigating T-03-09).

4. **Lifecycle Replay & Test Updates (`tests/lifecycle-replay.test.ts`, `tests/scope-gate.test.ts`, `tests/plan-checkpoint.test.ts`)**:
   - Updated `tests/lifecycle-replay.test.ts` to reflect the Golden Path v2 refinement model:
     - Revision 1: `New` -> audited pass -> parked in `New` with `[awaiting-scope-lock]` and `[audit-passed]`.
     - Revision 2: `Ready to Dev` + `[approve-scope]` -> scope approval -> `scopeLock.status = 'locked'`.
     - Revision 3: `In Dev` -> execution worker dispatched with options forwarding.
   - Added unit and integration tests in `tests/scope-gate.test.ts` for watchdog reminder (24h), escalation (72h), reconciliation, lifecycle stop, router verdict routing, and Step 3 fail-closed guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Pre-populated locked scopeLock in existing tests that route directly to In Dev**
- **Found during:** Task 2 verification (`npm test`)
- **Issue:** `tests/plan-checkpoint.test.ts` routed test ticket 6002 directly to `In Dev` without a prior refinement pass, which rightly triggered the new fail-closed router Step 3 guard and skipped execution.
- **Fix:** Pre-populated `scopeLock: { status: 'locked' }` in `stateStore` for ticket 6002 prior to routing, reflecting that tickets entering execution have locked scope.
- **Files modified:** `tests/plan-checkpoint.test.ts`
- **Commit:** `a6360b1`

## Verification Evidence

- `npx vitest run tests/scope-gate.test.ts -t "watchdog"`: 6 tests passing.
- `npx vitest run tests/scope-gate.test.ts -t "Router Verdict Dispatch"`: 3 tests passing.
- `npx vitest run tests/scope-gate.test.ts`: 28 tests passing (100%).
- `npx vitest run tests/lifecycle-replay.test.ts`: 6 tests passing (100%).
- `npm test`: 39 test files, 353 tests passing (100% repo-wide green).
- `npx tsc --noEmit`: 0 type errors.

## Self-Check: PASSED
