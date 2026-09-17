---
phase: 03-pm-scope-lock-gate
plan: 01
subsystem: auditor
tags:
  - scope-lock
  - auditor
  - idempotency
  - packet
  - state-store
dependency_graph:
  requires:
    - 02-02
  provides:
    - SCOPE-01
    - SCOPE-03
    - scope-lock-state
    - scope-review-packet
    - pre-llm-guard
  affects:
    - src/state/types.ts
    - src/scope/packet.ts
    - src/auditor/worker.ts
    - src/ado/work-item.ts
    - tests/worker.test.ts
    - tests/scope-gate.test.ts
tech_stack:
  added: []
  patterns:
    - pre-llm-idempotency-guard
    - scope-parking-interception
    - sanitized-html-packet
key_files:
  created:
    - src/scope/packet.ts
    - tests/scope-gate.test.ts
  modified:
    - src/state/types.ts
    - src/ado/work-item.ts
    - src/auditor/worker.ts
    - tests/worker.test.ts
decisions:
  - "[03-01]: Park audit-passed tickets in 'New' with tags '[awaiting-scope-lock]; [audit-passed]' and post scope review packet instead of auto-transitioning to 'Ready to Dev'"
  - "[03-01]: Pre-LLM idempotency guard checks ADO tags and StateStore scopeLock status early, skipping re-audit with dedup 'skipped' to eliminate token burns and duplicate transitions"
metrics:
  duration: 8m
  completed: 2026-09-17
---

# Phase 03 Plan 01: Audit Pass Parking & Pre-LLM Idempotency Guard Summary

Scope-locking gate interception in `src/auditor/worker.ts` delivering Refinement Step 2 prerequisite (SCOPE-01) and pre-LLM idempotency guard preventing re-audit bypass (SCOPE-03).

## Implementation Overview

1. **ScopeLockState Schema & StateStore Types (`src/state/types.ts`)**:
   - Added `ScopeLockState` interface modeling the PM review lifecycle (`status: 'pending' | 'locked' | 'rejected' | 'blocked'`, `iterationCount`, `requestedAt`, `lockedAt`, `lockedBy`, `feedback`, `remindedAt`, `escalatedAt`, `createdAt`, `updatedAt`).
   - Extended `TicketState` with `scopeLock?: ScopeLockState | null`.

2. **Scope Review Packet Formatter & Patch Builder (`src/scope/packet.ts`)**:
   - Implemented `formatScopeReviewPacketComment` rendering markdown with an audit status table (`AWAITING PM SCOPE LOCK`), criteria summary, collapsible DoD instructions with PM actions (`[approve-scope]`, `[reject-scope]`, `[reset-scope]`), sanitized via `sanitizeHtml` and protected by `<!-- [automated-agent] -->` comment shield.
   - Implemented `buildParkScopeLockPatch` applying `[awaiting-scope-lock]; [audit-passed]` tags and history comment without mutating `System.State`.
   - Enhanced `buildTagPatch` in `src/ado/work-item.ts` to support semicolon-delimited multi-tag additions cleanly without duplicates.

3. **Auditor Worker Interception & Pre-LLM Guard (`src/auditor/worker.ts`)**:
   - Added pre-LLM idempotency guard checking `workItem.tags?.includes('[awaiting-scope-lock]') || ticketState?.scopeLock?.status === 'pending'` and `workItem.tags?.includes('[scope-locked]') || ticketState?.scopeLock?.status === 'locked'`.
   - Skips evaluation early before LLM token burn, recording dedup status `'skipped'`.
   - Intercepted passing audit outcome to park ticket in `New` with scope review packet and initialize `draft.scopeLock` with `status: 'pending'` and `iterationCount: 0`.

4. **Wave 0 Test Scaffold & Regression Suites (`tests/scope-gate.test.ts`, `tests/worker.test.ts`)**:
   - Updated `tests/worker.test.ts` Case 1 to assert parked `New` state, tags, and pending `scopeLock` status.
   - Built `tests/scope-gate.test.ts` covering packet HTML generation, tag patch composition, SCOPE-01 parking, and SCOPE-03 multi-revision bypass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Enhanced `buildTagPatch` to handle multi-tag strings cleanly**
- **Found during:** Task 1 implementation.
- **Issue:** Passing multi-tag additions like `'[awaiting-scope-lock]; [audit-passed]'` to `buildTagPatch` resulted in raw combined strings if not split by `;`.
- **Fix:** Split `tagToAdd` on `;`, trimmed and filtered empty tokens, adding each tag idempotently.
- **Files modified:** `src/ado/work-item.ts`
- **Commit:** `e22c89d`

## Verification Evidence

- `npx vitest run tests/scope-gate.test.ts tests/worker.test.ts`: 11 tests passing (100%).
- `npx vitest run`: 39 test files, 331 tests passing (100% repo-wide green).
- `npx tsc --noEmit`: zero type errors.

## Self-Check: PASSED
