---
phase: 01-statestore-migration
plan: 05
subsystem: state
tags: [statestore, sqlite-eradication, workers, test-runner, deploy, learn, drizzle-removal]
dependency_graph:
  requires:
    - 01-02
    - 01-03
    - 01-04
  provides:
    - Complete pipeline worker migration to StateStore
    - Direct compilation of L1-L6 evidence indices from TicketState
    - Total eradication of SQLite (better-sqlite3, drizzle-orm, drizzle-kit, src/db)
  affects:
    - Entire application runtime and test infrastructure
tech_stack:
  added: []
  patterns:
    - Re-entrant workItemQueueManager lane execution
    - Frontmatter-based multi-stage evidence compilation
    - Direct file-backed lifecycle harvesting
key_files:
  created: []
  modified:
    - src/execute/worker.ts
    - src/execute/router.ts
    - src/execute/rework-worker.ts
    - src/test-runner/evidence.ts
    - src/deploy/worker.ts
    - src/deploy/telemetry.ts
    - src/deploy/evidence-index.ts
    - src/learn/harvester.ts
    - src/learn/worker.ts
    - src/queue/lane-manager.ts
    - src/config/env.ts
    - package.json
    - vitest.config.ts
  deleted:
    - src/db/index.ts
    - src/db/schema.ts
decisions:
  - Added re-entrancy check to WorkItemQueueManager.runInLane to allow safe nested stateStore operations without concurrency-1 deadlocks.
  - Excluded .worktrees/** in vitest.config.ts to prevent ephemeral worktree directories from triggering duplicate test execution.
  - Fully removed DATABASE_PATH from env and vitest config, solidifying SQLite eradication.
metrics:
  duration: 15m
  completed_date: "2026-09-17"
---

# Phase 1 Plan 5: StateStore Pipeline Migration and SQLite Elimination Summary

Complete StateStore migration across execution, test runner, deploy, and learn subsystems, full elimination of SQLite/Drizzle dependencies, and 100% test suite pass rate on file-backed storage.

## Key Changes

1. **Execution & Test Runner Subsystems**:
   - Migrated `recordL3Evidence` in `src/test-runner/evidence.ts` to append directly to `draft.l3Evidence` via StateStore.
   - Updated `processWorkItemExecute` and `processWorkItemRework` to record deduplication statuses using `stateStore.updateDedupStatus`.
   - Updated `src/execute/router.ts` to inspect L3 test verification metrics through `stateStore.getTicketState(workItemId)`.
   - Prioritized local branch candidates (`master`, `main`) in `rework-worker.ts` for clean git base commit calculation in test environments.

2. **Deploy & Learn Subsystems**:
   - Migrated `processDeploymentPreparation` and `processTelemetryEvaluation` in `src/deploy/worker.ts` to persist deployment records into `TicketState.deploymentRecords`.
   - Migrated `evaluateProductionTelemetry` in `src/deploy/telemetry.ts` to record evaluations in `TicketState.telemetryEvaluations`.
   - Re-engineered `compileL1L6EvidenceIndex` in `src/deploy/evidence-index.ts` to compile L1 through L6 evidence directly from `TicketState` without database queries, saving the compiled summary into `draft.evidenceIndex`.
   - Updated `harvestTicketLifecycleData` in `src/learn/harvester.ts` to read rework cycles, L3 test runs, QA evidence, and telemetry evaluations directly from `TicketState`.
   - Migrated `src/learn/worker.ts` to store staged skills PR records in `draft.skillsPrs`.

3. **Complete SQLite & Drizzle Eradication**:
   - Removed `src/db/index.ts` and `src/db/schema.ts`, completely deleting `src/db/`.
   - Removed `better-sqlite3` and `drizzle-orm` from `dependencies` in `package.json`.
   - Removed `@types/better-sqlite3` and `drizzle-kit` from `devDependencies` in `package.json`.
   - Removed `DATABASE_PATH` from `src/config/env.ts` and `vitest.config.ts`.
   - Upgraded `WorkItemQueueManager.runInLane` in `src/queue/lane-manager.ts` with re-entrancy support to eliminate self-deadlocks on nested lane operations.
   - Configured `vitest.config.ts` to exclude `.worktrees/**` from test discovery.
   - Migrated all remaining tests (`tests/l3-evidence.test.ts`, `tests/rework-integration.test.ts`, `tests/deploy-packet.test.ts`, `tests/deploy-telemetry.test.ts`, `tests/deploy-orchestrator.test.ts`, `tests/learn-orchestrator.test.ts`, `tests/learn-generator.test.ts`, `tests/qa-runner.test.ts`, `tests/qa-orchestrator.test.ts`, `tests/pr-merge.test.ts`, `tests/pr-rework.test.ts`) to `createTestStateStore()`.

## Verification

- `npx tsc --noEmit` runs with 0 type errors.
- `npm test` executes all 36 test files: 312 tests passed, 0 failures.
- Zero imports from `drizzle-orm`, `better-sqlite3`, or `../db/` remain anywhere in `src/` or `tests/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nested lane re-entrancy deadlock**
- **Found during:** Task 3 full test execution (`tests/plan-checkpoint.test.ts`)
- **Issue:** `routeWorkItemEvent` was executed inside `runInLane(workItemId)`. It called `processWorkItemExecute`, which called `recordL3Evidence`, which also invoked `runInLane(workItemId)`. Because `PQueue` has `concurrency: 1`, the nested call queued behind the active task, resulting in a self-deadlock.
- **Fix:** Added a re-entrancy check to `WorkItemQueueManager.runInLane`: if `laneContext.getStore()?.workItemId === workItemId`, execute the callback immediately without re-queuing.
- **Files modified:** `src/queue/lane-manager.ts`
- **Commit:** `9b19682`

**2. [Rule 3 - Blocking Issue] Vitest discovering test files in ephemeral worktrees**
- **Found during:** Task 3 test run
- **Issue:** When execution tests create ephemeral worktrees in `.worktrees/`, vitest's default glob pattern picked up tests inside `.worktrees/ticket-*/tests/`, leading to duplicate runs and race conditions.
- **Fix:** Added `'**/.worktrees/**'` to `test.exclude` in `vitest.config.ts`.
- **Files modified:** `vitest.config.ts`
- **Commit:** `9b19682`

## Self-Check: PASSED
- `src/db/` deleted: FOUND (does not exist)
- Commits exist: `0b09d34`, `b0e62b9`, `9b19682`
- All tests pass: 36 test files, 312 tests green
