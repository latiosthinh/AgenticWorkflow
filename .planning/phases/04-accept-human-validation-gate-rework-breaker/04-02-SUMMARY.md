---
phase: 04-accept-human-validation-gate-rework-breaker
plan: 02
subsystem: accept
tags:
  - circuit-breaker
  - rework-cycles
  - escalation
  - sqlite
  - drizzle
  - bot-shield
dependency_graph:
  requires:
    - 04-01 (Acceptance packet formatter and Dev Done transition patch)
  provides:
    - Drizzle ORM schema and SQLite table for rework_cycles (src/db/schema.ts, src/db/index.ts)
    - Shared circuit breaker service evaluating bounce limits across gates (src/accept/breaker.ts)
    - Rework cycle reset mechanism for tech lead intervention (src/accept/breaker.ts)
    - Escalation JSON patch builder transitioning work item to Blocked with [rework-escalated] tag and shield comment (src/accept/breaker.ts)
  affects:
    - 04-03 (Human acceptance rejection handler and rework loop integration)
    - Phase 5 (PR Review rejection rework loop sharing the breaker)
tech_stack:
  added: []
  patterns:
    - Drizzle ORM compound index on (workItemId, bounceCount)
    - SQLite transactional upsert with onConflictDoUpdate on primary key workItemId
    - Atomic Azure DevOps JSON Patch updating System.State to Blocked, adding [rework-escalated], and removing [awaiting-acceptance]
    - Bot echo loop prevention via <!-- [automated-agent] --> comment shield
key_files:
  created:
    - src/accept/breaker.ts
    - tests/rework-breaker.test.ts
  modified:
    - src/db/schema.ts
    - src/db/index.ts
decisions:
  - "Used SQLite transactional upsert with onConflictDoUpdate on primary key workItemId to ensure atomic increment and prevent race conditions"
  - "Configured shared maximum bounce limit of 2, tripping on the 3rd rejection across both accept and pr_review gates"
  - "Preserved escalatedAt timestamp across subsequent rejected evaluations once circuit breaker is tripped"
  - "Appended <!-- [automated-agent] --> loop shield comment to escalation comments to prevent webhook echo loops"
metrics:
  duration: 4m
  completed_date: "2026-09-09"
  tasks: 2
  files: 4
---

# Phase 04 Plan 02: Shared Rework Circuit Breaker Summary

Substantive achievement: Defined the `rework_cycles` SQLite table schema, implemented the shared rework circuit breaker service capping automated bounces at 2 across Accept and PR Review gates, added counter reset capabilities, and built the Tech Lead escalation JSON patch builder transitioning tickets to `Blocked` with `[rework-escalated]` tag and bot loop shield.

## Key Changes

1. **Database Schema & SQLite DDL (`ACCP-03`):**
   - Added `reworkCycles` table in `src/db/schema.ts` with `workItemId` (primary key), `bounceCount` (default 0), `lastBounceAt`, `sourceGate` (enum: `'accept' | 'pr_review'`), `escalatedAt`, `createdAt`, and `updatedAt`.
   - Added compound index `idx_rework_cycles_lookup` on `(workItemId, bounceCount)`.
   - Exported TypeScript types `ReworkCycle` and `InsertReworkCycle`.
   - Updated `src/db/index.ts` to execute table and index DDL on startup.

2. **Circuit Breaker Service (`ACCP-03`):**
   - Implemented `evaluateCircuitBreaker` in `src/accept/breaker.ts`:
     - Wraps operations in `db.transaction`.
     - Executes transactional upsert via `.onConflictDoUpdate` targeting `reworkCycles.workItemId`.
     - Returns `{ allowed: true, currentCount: 1 }` on 1st rejection.
     - Returns `{ allowed: true, currentCount: 2 }` on 2nd rejection across either gate.
     - Trips breaker on 3rd rejection (`previousCount >= 2`), returning `{ allowed: false, currentCount: 3 }` and stamping `escalatedAt`.
     - Maintains `allowed: false` on subsequent rejections while tripped.
   - Implemented `resetCircuitBreaker` in `src/accept/breaker.ts`:
     - Resets `bounceCount` to 0 and clears `escalatedAt` to null, enabling human tech leads to unblock tickets.

3. **Tech Lead Escalation Patch Builder (`ACCP-03`):**
   - Implemented `buildEscalationPatch` in `src/accept/breaker.ts`:
     - Replaces `System.State` with `'Blocked'`.
     - Adds `[rework-escalated]` tag and removes `[awaiting-acceptance]` tag via `buildTagPatch`.
     - Appends HTML escalation comment explaining the policy violation and tech lead resolution instructions (`[reset-rework]`).
     - Includes `<!-- [automated-agent] -->` shield to drop webhook re-triggers.

4. **Automated Unit Tests (`tests/rework-breaker.test.ts`):**
   - Verified 1st rejection allowance and SQLite persistence.
   - Verified 2nd rejection allowance across different gates (`accept` then `pr_review`).
   - Verified 3rd rejection breaker trip and `escalatedAt` setting.
   - Verified continued rejection on subsequent attempts while tripped.
   - Verified `resetCircuitBreaker` clearing count to 0, clearing `escalatedAt`, and allowing fresh restarts.
   - Verified `buildEscalationPatch` operations for `Blocked` state, tag transitions, and comment shield.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: `src/db/schema.ts`
- FOUND: `src/db/index.ts`
- FOUND: `src/accept/breaker.ts`
- FOUND: `tests/rework-breaker.test.ts`
- FOUND commit `9b2c984`: feat(04-02): define Drizzle schema and SQLite table for rework_cycles
- FOUND commit `f0094ba`: feat(04-02): implement shared rework circuit breaker and escalation patch builder
