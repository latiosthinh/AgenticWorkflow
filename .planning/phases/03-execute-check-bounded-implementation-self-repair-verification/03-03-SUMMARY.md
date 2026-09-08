---
phase: 03-execute-check-bounded-implementation-self-repair-verification
plan: 03
subsystem: test-runner
tags: [sqlite, drizzle, l3-evidence, ado-transition, diff-guard, immutability, self-repair]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [L3EvidencePersistence, DevDoneTransition, BlockedTransition]
  affects: [ado-boards, execution-pipeline]
tech_stack:
  added: []
  patterns: [SQLite WAL evidence storage, sanitized HTML discussion badges, ADO JSON patch state transitions]
key_files:
  created:
    - src/test-runner/evidence.ts
    - tests/l3-evidence.test.ts
  modified:
    - src/db/schema.ts
    - src/db/index.ts
    - src/ado/work-item.ts
    - src/execute/worker.ts
decisions:
  - "L3 Evidence records metrics in SQLite l3_evidence table before transitioning ADO ticket state to prevent phantom transitions."
  - "Discussion comments format sanitized HTML badges with <!-- [automated-agent] --> loop marker to protect against webhook cycles."
  - "Work item state transitions to Dev Done with [l3-verified] tag upon passing verification; transitions to Blocked with diagnostic tags upon violations or repair exhaustion."
metrics:
  duration: 6m
  completed_date: "2026-09-08"
---

# Phase 3 Plan 03: Structured L3 Evidence & Dev Done Transition Summary

Persisted structured L3 test evidence in SQLite, formatted sanitized ADO discussion badges, and connected the end-to-end execution pipeline transitioning passing tickets to Dev Done.

## What Was Done

### Task 1: L3 Evidence Schema, SQLite Persistence, and ADO Discussion Badges
- Defined `l3Evidence` table and types `L3Evidence`, `InsertL3Evidence` in `src/db/schema.ts`.
- Added DDL table creation and index `idx_l3_evidence_lookup` on `(work_item_id, rev_id)` in `src/db/index.ts`.
- Implemented `recordL3Evidence`, `formatL3EvidenceComment`, `buildDevDonePatch`, `buildRepairExhaustedPatch`, and `buildContractConflictPatch` in `src/test-runner/evidence.ts`.
- Formatted markdown reports into sanitized HTML containing the `### [L3 Evidence] Functional Verification: PASSED` badge and `<!-- [automated-agent] -->` comment shield.

### Task 2: End-to-End Orchestration & ADO State Transitions
- Added `transitionToDevDone` and `flagTicketBlocked` REST operations to `src/ado/work-item.ts`.
- Connected the full implementation pipeline in `src/execute/worker.ts`:
  1. Protects test assertion files with `protectTestFiles`.
  2. Bounded code editing in isolated worktree.
  3. Verifies cumulative diff does not exceed 250 LOC via `assertDiffCeiling` / `calculateCumulativeDiff`.
  4. Verifies `package.json` dependency additions via `verifyPackageDependencies`.
  5. Enforces baseline test immutability via `checkTestImmutability`.
  6. Executes local test runs and self-repair loop via `executeRepairLoop`.
  7. On success: persists structured L3 evidence to SQLite, posts `[L3 Evidence]` badge comment, tags `[l3-verified]`, transitions state to `Dev Done`, and cleans up worktree.
  8. On failure: posts diagnostic discussion comment, tags `[repair-exhausted]`, `[contract-conflict]`, or `[diff-ceiling-exceeded]`, flags state `Blocked`, and preserves WIP branch.
- Created 15 test cases in `tests/l3-evidence.test.ts` covering persistence, formatting, patch creation, and end-to-end worker orchestration.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| None | N/A | All generated HTML comments are sanitized via `sanitizeHtml` and tagged with bot shield; database records adhere to strict Drizzle schema. |

## Known Stubs

None - full execution pipeline and persistence layer wired to live SQLite and ADO patch helpers.

## Verification Results

Command: `npm test`
- All 15 test suites passed.
- All 135 unit and integration tests passed.
- Command: `npx vitest run tests/l3-evidence.test.ts` (15/15 passing).
- Command: `npm run build` (`tsc`) compiled with 0 errors.

## Self-Check: PASSED

- FOUND: `src/test-runner/evidence.ts`
- FOUND: `tests/l3-evidence.test.ts`
- FOUND: `src/db/schema.ts`
- FOUND: `src/db/index.ts`
- FOUND: `src/ado/work-item.ts`
- FOUND: `src/execute/worker.ts`
- FOUND commit: `6e57ffa`
- FOUND commit: `0dfb664`
