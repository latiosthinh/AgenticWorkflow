---
phase: 01-statestore-migration
plan: 04
subsystem: plan-accept-qa
tags: [statestore, plan-checkpoints, watchdog, rework-breaker, qa-breaker, qa-runner, qa-worker, archive]
requires:
  - phase: 01-statestore-migration
    plan: 01
  - phase: 01-statestore-migration
    plan: 03
provides:
  - "Plan checkpoint CRUD operations backed by StateStore planCheckpoints array"
  - "Watchdog timer scanning active tickets via stateStore.listTickets and routing mutations via runInLane"
  - "Acceptance rework circuit breaker tracking bounceCount in ticket frontmatter"
  - "QA circuit breaker tracking bounceCount in ticket frontmatter"
  - "QA runner two-strike filter persisting qaRuns entries to ticket state"
  - "QA worker persisting aggregate qaEvidence to ticket state"
  - "Archive lifecycle ensuring directory scans remain bounded at O(active tickets)"
affects:
  - src/plan/checkpoint.ts
  - src/plan/watchdog.ts
  - src/accept/breaker.ts
  - src/qa/breaker.ts
  - src/qa/runner.ts
  - src/qa/worker.ts
  - tests/state-scans.test.ts
  - tests/plan-checkpoint.test.ts
  - tests/rework-breaker.test.ts
  - tests/qa-breaker.test.ts
tech-stack:
  added: []
  patterns:
    - "Plan checkpoints persisted directly inside TicketState planCheckpoints frontmatter array"
    - "Background watchdog scanner querying stateStore.listTickets() with runInLane mutation serialization"
    - "Breaker bounce counters serialized through single-writer lane without SQLite transactions"
    - "QA run traces and aggregate verification evidence persisted directly into ticket Markdown documents"
    - "Archival of completed tickets to data/state/archive/ keeping active ticket scans O(active tickets)"
key-files:
  created:
    - tests/state-scans.test.ts
  modified:
    - src/plan/checkpoint.ts
    - src/plan/watchdog.ts
    - src/accept/breaker.ts
    - src/qa/breaker.ts
    - src/qa/runner.ts
    - src/qa/worker.ts
    - tests/plan-checkpoint.test.ts
    - tests/rework-breaker.test.ts
    - tests/qa-breaker.test.ts
decisions:
  - "Migrated plan checkpoints and watchdog scanner to StateStore with O(active tickets) readdir directory scans"
  - "Migrated rework circuit breaker and QA circuit breaker bounce counters into single-writer serialized TicketState frontmatter"
  - "Persisted QA test runs and evidence directly into ticket documents without SQLite dependencies"
metrics:
  duration: 8m
  completed_date: "2026-09-17"
  tasks: 2
  files: 10
---

# Phase 01 Plan 04: Plan Checkpoints, Watchdog Scans, Circuit Breakers & QA StateStore Migration Summary

Migrated plan checkpoints, watchdog background scanner, rework and QA circuit breakers, and the QA test execution/evidence subsystem to file-backed `StateStore`, routing all mutations through per-ticket concurrency:1 queue lanes and maintaining O(active tickets) directory scans via the archive lifecycle.

## Overview of Changes

1. **Plan Checkpoints & Watchdog Scanner (`src/plan/checkpoint.ts`, `src/plan/watchdog.ts`)**:
   - Removed SQLite `planCheckpoints` table queries and Drizzle imports.
   - `createPlanCheckpoint`, `getPendingCheckpoint`, `lockPlanCheckpoint`, and `updateCheckpointStatus` now read and mutate `ticket.planCheckpoints` in `TicketState` frontmatter.
   - `checkPlanCheckpointTimeouts` discovers active work items via `stateStore.listTickets()` (scanning `data/state/tickets/*.md`) and wraps timeout updates in `workItemQueueManager.runInLane`.

2. **Rework & QA Circuit Breakers (`src/accept/breaker.ts`, `src/qa/breaker.ts`)**:
   - Removed SQLite `rework_cycles` and `qa_bounces` table upserts and transactions.
   - `evaluateCircuitBreaker` and `resetCircuitBreaker` persist bounce counts and escalation timestamps in `draft.reworkCycles`.
   - `evaluateQaCircuitBreaker`, `recordQaBounce`, and `resetQaBounces` operate on `draft.qaBounces`.

3. **QA Runner & Worker Evidence (`src/qa/runner.ts`, `src/qa/worker.ts`)**:
   - Removed `qa_runs` and `qa_evidence` SQLite tables and Drizzle operations.
   - `executeTwoStrikeQaFilter` logs sequential run records to `draft.qaRuns`.
   - `processQaVerification` logs aggregate pass/fail test evidence into `draft.qaEvidence`.

4. **Archive Lifecycle & Unit Test Suites (`tests/state-scans.test.ts`, `tests/plan-checkpoint.test.ts`, `tests/rework-breaker.test.ts`, `tests/qa-breaker.test.ts`)**:
   - Added `tests/state-scans.test.ts` verifying `stateStore.listTickets()` correctly omits tickets archived to `data/state/archive/`, and ignores temp/dot files.
   - Updated `tests/plan-checkpoint.test.ts`, `tests/rework-breaker.test.ts`, and `tests/qa-breaker.test.ts` to use `createTestStateStore()`, completely eliminating SQLite dependencies.

## Key Decisions

- **Single-writer lane preservation**: Checkpoint, breaker, and QA updates evaluate `laneContext.getStore()`; if called outside an active lane (such as standalone unit tests or watchdog scans), calls automatically route through `workItemQueueManager.runInLane(workItemId, ...)` to guarantee the single-writer invariant without deadlock.
- **O(active tickets) scan bounds**: Background timers and discovery mechanisms scan only `tickets/`. Archived tickets are moved to `archive/` to keep directory scan times bounded regardless of cumulative ticket history.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Compliance

| Threat ID | Category | Component | Disposition | Verification |
|-----------|----------|-----------|-------------|--------------|
| T-01-09 | Denial of Service | Watchdog directory scan | mitigate | stateStore.listTickets() scans active tickets directory only; stateStore.archiveTicket() isolates completed tickets in archive directory; verified in tests/state-scans.test.ts |
| T-01-10 | Tampering | Circuit breaker bounce counter | mitigate | bounceCount persists in single-writer serialized ticket frontmatter; off-lane mutations rejected; verified in tests/rework-breaker.test.ts and tests/qa-breaker.test.ts |

## Self-Check: PASSED

- All key files exist: `src/plan/checkpoint.ts`, `src/plan/watchdog.ts`, `src/accept/breaker.ts`, `src/qa/breaker.ts`, `src/qa/runner.ts`, `src/qa/worker.ts`, `tests/state-scans.test.ts`.
- Commits verified: `c4804f1`, `5ce2ab2`.
- Automated test verification passed: `npx vitest run tests/state-scans.test.ts tests/plan-checkpoint.test.ts tests/rework-breaker.test.ts tests/qa-breaker.test.ts` (28 tests passed).
