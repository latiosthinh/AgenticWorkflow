---
phase: 01-statestore-migration
plan: 03
subsystem: state
tags: [statestore, async-local-storage, single-writer, crash-atomicity, p-queue]
requires:
  - phase: 01-statestore-migration
    plan: 01
provides:
  - "AsyncLocalStorage laneContext bound to per-work-item lane (concurrency: 1)"
  - "WorkItemQueueManager.runInLane method setting laneContext"
  - "OffLaneMutationError rejection for off-lane or cross-ticket mutations in updateTicketState"
  - "Windows-safe crash-atomic writes with sibling .tmp staging and unlinkSync-before-renameSync"
  - "Automatic orphan sibling temp file recovery on ticket state/notes reads and updates"
affects:
  - src/queue/lane-manager.ts
  - src/state/store.ts
  - src/ingress/routes.ts
  - tests/lane-manager.test.ts
  - tests/state-single-writer.test.ts
  - tests/state-store.test.ts
  - tests/worker.test.ts
tech-stack:
  added: []
  patterns:
    - "Node.js native AsyncLocalStorage for ambient execution context"
    - "Single-writer invariant enforced at StateStore API boundary via verifyLane"
    - "Windows NTFS EPERM mitigation: unlinkSync before renameSync"
    - "Orphan temporary file recovery ordered by mtime descending"
key-files:
  created:
    - tests/lane-manager.test.ts
    - tests/state-single-writer.test.ts
  modified:
    - src/queue/lane-manager.ts
    - src/state/store.ts
    - src/ingress/routes.ts
    - tests/state-store.test.ts
    - tests/worker.test.ts
decisions:
  - "Bound AsyncLocalStorage to per-work-item concurrency:1 lane queues, rejecting mutations outside matching lane context"
  - "Added orphan sibling temp file recovery (.workItemId.md.tmp.*) on read and update to preserve crash atomicity"
  - "Updated ingress routes to invoke background handlers via workItemQueueManager.runInLane to maintain ambient context"
metrics:
  duration: 6m
  completed_date: "2026-09-17"
  tasks: 2
  files: 7
---

# Phase 01 Plan 03: StateStore Single-Writer Invariant & Crash Atomicity Summary

Enforced the single-writer invariant using Node.js native `AsyncLocalStorage` (`laneContext`) bound to per-work-item concurrency:1 queues, and implemented Windows-safe crash-atomic file writes with orphan temp file recovery.

## Overview of Changes

1. **AsyncLocalStorage Context & `runInLane` (`src/queue/lane-manager.ts`)**:
   - Exported `laneContext = new AsyncLocalStorage<{ workItemId: number }>()`.
   - Added `runInLane<T>(workItemId: number, fn: () => Promise<T>): Promise<T>` to `WorkItemQueueManager`.
   - Serialized tasks onto dedicated per-work-item `PQueue` (`concurrency: 1`) executing within `laneContext.run({ workItemId }, fn)`.

2. **Single-Writer Invariant & Crash Atomicity (`src/state/store.ts`)**:
   - Implemented `verifyLane(workItemId: number): void` inspecting `laneContext.getStore()`.
   - Rejects uncontextualized calls or cross-ticket lane mismatches with `OffLaneMutationError`.
   - Enforced `verifyLane(workItemId)` at the entry point of `FileStateStore.updateTicketState`.
   - Implemented `recoverOrphanTempFile`: when reading or updating a non-existent target ticket, scans sibling `.${workItemId}.md.tmp.*` candidate files, sorts by `mtime` descending, validates frontmatter structure, and renames the newest valid temp file to the target.
   - Guarded Windows NTFS atomic replacement with `fs.unlinkSync(targetPath)` before `fs.renameSync(tempPath, targetPath)`.

3. **Ingress & Caller Wiring (`src/ingress/routes.ts`, `tests/worker.test.ts`, `tests/state-store.test.ts`)**:
   - Updated `routes.ts` background task dispatching to use `workItemQueueManager.runInLane(workItemId, ...)` ensuring all worker executions run within the proper ambient lane context.
   - Adapted test suites to invoke mutations through `runInLane`.

4. **Automated Verification Suites (`tests/lane-manager.test.ts`, `tests/state-single-writer.test.ts`)**:
   - Verified `runInLane` sequential serialization and context propagation.
   - Tested direct off-lane mutation rejection, cross-ticket mutation rejection, on-lane success, crash recovery of newest sibling temp file, and intact state preservation on mutator failures.

## Key Decisions

- **Ambient context via AsyncLocalStorage**: Leveraged Node.js `async_hooks` `AsyncLocalStorage` so callers do not have to pass queue references down function chains; `FileStateStore.updateTicketState` automatically validates that the calling asynchronous execution stack is inside the dedicated per-work-item queue lane.
- **Orphan temporary recovery**: Handled process crash scenarios where a file was flushed to a sibling `.tmp` file but terminated before rename. The next read or update recovers the newest valid `.tmp` file, ensuring no data loss without a relational database.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Ingress background dispatching updated to `runInLane`**
- **Found during:** Task 2 integration verification
- **Issue:** `src/ingress/routes.ts` previously enqueued background work with `getLane(workItemId).add(...)`, which did not activate `laneContext`, causing downstream `updateTicketState` calls to fail with `OffLaneMutationError`.
- **Fix:** Switched to `workItemQueueManager.runInLane(workItemId, ...)` in `src/ingress/routes.ts`.
- **Files modified:** `src/ingress/routes.ts`
- **Commit:** `146e5d4`

**2. [Rule 3 - Blocking Issue] Adapted existing test callers to invoke mutations inside `runInLane`**
- **Found during:** Task 2 verification
- **Issue:** Direct calls in `tests/worker.test.ts` and `tests/state-store.test.ts` called `updateTicketState` without lane context.
- **Fix:** Wrapped test mutations in `workItemQueueManager.runInLane(workItemId, ...)`.
- **Files modified:** `tests/worker.test.ts`, `tests/state-store.test.ts`
- **Commit:** `146e5d4`

## Threat Model Compliance

| Threat ID | Category | Component | Disposition | Verification |
|-----------|----------|-----------|-------------|--------------|
| T-01-07 | Tampering | StateStore.updateTicketState | mitigate | verifyLane() checks laneContext.getStore() and throws OffLaneMutationError on absence/mismatch; verified in tests/state-single-writer.test.ts (Tests 1 & 2) |
| T-01-08 | Denial of Service | writeCrashAtomicSync | mitigate | writeCrashAtomicSync writes sibling .tmp files, unlinks target on win32 before rename, and recoverOrphanTempFile recovers intact state; verified in tests/state-single-writer.test.ts (Tests 4 & 5) |

## Self-Check: PASSED

- All key files exist on disk: `src/queue/lane-manager.ts`, `src/state/store.ts`, `tests/state-single-writer.test.ts`, `tests/lane-manager.test.ts`.
- Commits verified: `6a6c6fd`, `ab8f9ec`, `430b721`, `146e5d4`.
- All 33 tests in `tests/state-single-writer.test.ts`, `tests/lane-manager.test.ts`, `tests/state-store.test.ts`, `tests/worker.test.ts`, and `tests/ingress.test.ts` pass cleanly.
