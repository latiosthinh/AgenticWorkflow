---
phase: 01-statestore-migration
plan: 02
subsystem: ingress
tags: [statestore, dedup, ingress, fastify, auditor]
requires:
  - phase: 01-statestore-migration
    plan: 01
provides:
  - "Atomic OS-level webhook deduplication markers in data/state/dedup/<id>-<rev>.json"
  - "Fastify webhook handler backed by FileStateStore"
  - "L1 contract auditor persisting to TicketState auditLogs without SQLite"
affects:
  - src/ingress/routes.ts
  - src/auditor/worker.ts
  - src/index.ts
  - tests/dedup.test.ts
  - tests/ingress.test.ts
  - tests/worker.test.ts
tech-stack:
  added: []
  patterns:
    - "Kernel-level atomic file creation (flag: 'wx') for deduplication"
    - "Test harness binding with resetStateStore and isolated mkdtemp directories"
key-files:
  created: []
  modified:
    - src/ingress/routes.ts
    - src/auditor/worker.ts
    - src/index.ts
    - src/state/index.ts
    - src/state/store.ts
    - src/state/types.ts
    - tests/dedup.test.ts
    - tests/ingress.test.ts
    - tests/worker.test.ts
decisions:
  - "Delegated stateStore methods through dynamic store reference with resetStateStore for seamless test directory rebinding"
  - "Protected terminal dedup statuses ('skipped', 'failed') from being overwritten by 'completed' in FileStateStore"
metrics:
  duration: 4m
  completed_date: "2026-09-17"
  tasks: 2
  files: 9
---

# Phase 01 Plan 02: Ingress & Auditor StateStore Migration Summary

Migrated webhook ingress deduplication, auditor worker state persistence, and background sweeper from SQLite `dedup_events` and `audit_log` to the filesystem-backed `StateStore` with atomic `wx` marker creation.

## Overview of Changes

1. **Ingress Webhook Deduplication (`src/ingress/routes.ts`)**:
   - Replaced SQLite `dedupEvents` queries with `stateStore.recordDedupEvent(workItemId, revId, payloadHash)`.
   - On `isDuplicate: true`, immediately logs warning and replies HTTP 200 `{ status: 'duplicate_ignored' }`.
   - Handled PR webhook deduplication and bot echo marker recording via `stateStore.recordDedupEvent` and `stateStore.updateDedupStatus`.
   - Removed all SQLite and Drizzle ORM imports (`db`, `dedupEvents`, `eq`, `and`).

2. **Auditor Worker Pipeline (`src/auditor/worker.ts`)**:
   - Replaced SQLite `auditLogs` insertion with `stateStore.updateTicketState(...)` appending structured audit log entries into `TicketState.auditLogs`.
   - Updated dedup statuses to `'skipped'`, `'completed'`, or `'failed'` via `stateStore.updateDedupStatus`.
   - Removed all SQLite and Drizzle ORM imports.

3. **Server Sweeper & Shutdown (`src/index.ts`)**:
   - Pointed startup sweeper and 24-hour interval timer to `purgeOldDedupEvents(7)` from `src/state/index.js`.
   - Removed `sqlite.close()` call during graceful shutdown.

4. **Test Suite Modernization (`tests/dedup.test.ts`, `tests/ingress.test.ts`, `tests/worker.test.ts`)**:
   - Replaced SQLite tables with isolated `createTestStateStore()` ephemeral directories.
   - Verified atomic `wx` marker creation and concurrent rejection across 10 parallel calls (1 success, 9 duplicates).
   - Validated HTTP 202 Accepted and HTTP 200 `duplicate_ignored` responses.
   - Asserted `TicketState.auditLogs` persistence and dedup status transitions without SQLite.

## Key Decisions

- **StateStore proxy and resetStateStore**: Implemented a delegating `stateStore` proxy and `resetStateStore()` in `src/state/index.ts` so tests can dynamically rebind `STATE_STORE_DIR` to ephemeral `mkdtemp` test directories without touching production code signatures.
- **Terminal dedup status protection**: Enhanced `FileStateStore.updateDedupStatus` to protect terminal states (`skipped`, `failed`) from being inadvertently overwritten by subsequent `completed` calls.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Compliance

| Threat ID | Category | Component | Disposition | Verification |
|-----------|----------|-----------|-------------|--------------|
| T-01-04 | Repudiation / Replay | recordDedupEvent | mitigate | Atomic writeFileSync with { flag: 'wx' } verified via 10-call concurrent test in tests/dedup.test.ts |
| T-01-05 | Denial of Service | purgeOldDedupEvents | mitigate | 7-day TTL sweep verified in tests/dedup.test.ts and wired into startup/interval in src/index.ts |
| T-01-06 | Tampering | updateDedupStatus | mitigate | Integer validation on workItemId and revId guarded before constructing marker paths |

## Self-Check: PASSED

- All 9 modified files verified on disk.
- Task 1 commit: `6ad33b0` (feat: migrate ingress routes, auditor worker, and startup sweeper).
- Task 2 commit: `6654537` (test: adapt ingress, dedup, and auditor test suites).
- 19 of 19 automated tests passed in `vitest run tests/dedup.test.ts tests/ingress.test.ts tests/worker.test.ts`.
