---
phase: 01-statestore-migration
fixed_at: "2026-09-17T18:26:00Z"
review_path: .planning/phases/01-statestore-migration/01-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-09-17T18:26:00Z
**Source review:** .planning/phases/01-statestore-migration/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: Permanent Data Loss Risk in Windows Crash-Atomic Write

**Files modified:** `src/state/store.ts`
**Commit:** `9f4a7b8`
**Applied fix:** Direct rename attempted first without deleting target; on Windows EPERM/EEXIST fallback creates temporary `.bak` backup file and restores target if rename fails.

### WR-01: Non-Unique Checkpoint IDs and Ambiguous Cross-Ticket Lookup

**Files modified:** `src/plan/checkpoint.ts`, `src/execute/worker.ts`
**Commit:** `8ba2332`
**Applied fix:** Supported optional `explicitWorkItemId` in `lockPlanCheckpoint` and `updateCheckpointStatus`, passed workItemId from execution worker, and enforced error throwing on ambiguous cross-ticket lookups.

### WR-02: Missing `await` on `resetCircuitBreaker` in Work Item Router

**Files modified:** `src/execute/router.ts`
**Commit:** `acbbbff`
**Applied fix:** Added `await` to `resetCircuitBreaker(workItemId)` before completing deduplication status.

### WR-03: Race Condition in Watchdog Checkpoint Escalation & Reminder

**Files modified:** `src/plan/watchdog.ts`
**Commit:** `86dfcf1`
**Applied fix:** Wrapped ADO update, status check, and ticket state mutation atomically inside `workItemQueueManager.runInLane(ticket.workItemId, ...)` and verified status is still pending before notifying.

### WR-04: Falsy Numeric Coercion Corrupting Zero Passing Tests in Lifecycle Harvester

**Files modified:** `src/learn/harvester.ts`
**Commit:** `aa84eab`
**Applied fix:** Replaced logical OR `||` with nullish coalescing `??` for `unitTestsPassed` and `unitTestsTotal` to preserve 0 passed tests.

### WR-05: Missing Ticket Archival in Production Pipeline Workflow

**Files modified:** `src/deploy/worker.ts`
**Commit:** `74e1067`
**Applied fix:** Chained `stateStore.archiveTicket(workItemId)` in the `.finally` handler of the post-Done learning feedback loop.

### WR-06: Crash-Atomic Temporary Files in `dedupDir` Never Purged

**Files modified:** `src/state/store.ts`
**Commit:** `694c7c4`
**Applied fix:** Updated `purgeOldDedupEvents` to match and remove orphaned `.json.tmp.` files exceeding retention cutoff.

### WR-07: Unchecked JSON Parsing in `compileL1L6EvidenceIndex`

**Files modified:** `src/deploy/evidence-index.ts`
**Commit:** `f7c0246`
**Applied fix:** Wrapped `JSON.parse(l1Record.reasons)` in `try/catch` with fallback array/string format if parsing fails.

---

_Fixed: 2026-09-17T18:26:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
