---
phase: 07-docs-realignment-e2e-proof
plan: 01
subsystem: documentation-and-testing
tags: [e2e-simulation, drift-guard, state-matrix, statestore, taxonomy, milestone-v2]
dependency_graph:
  requires:
    - 06-03 (Done transition re-sequencing & fail-closed L7 gate)
    - 05-03 (Smoke & composite L6 evidence)
    - 04-02 (Fail-closed L1-L7 evidence index compiler)
    - 03-03 (PM scope-lock gate)
    - 02-02 (Taxonomy router integration)
    - 01-05 (File-backed StateStore foundation)
  provides:
    - Complete Milestone v2.0 Golden Path v2 implementation and proof
    - Automated drift guard for Authoritative ADO State Matrix vs GOLDEN_PATH_V2
    - End-to-end 9-step simulation on file-backed StateStore
  affects:
    - CLAUDE.md (stack definitions realigned to StateStore)
    - .planning/PROJECT.md (milestone v2.0 active targets complete)
    - .planning/REQUIREMENTS.md (TAX-02 complete, 19/19 v2.0 complete)
    - .planning/ROADMAP.md (Phase 7 complete)
tech_stack:
  added: []
  patterns:
    - Automated markdown table parsing drift guard without external AST parser deps
    - Complete 9-step end-to-end simulation across revisions on file-backed StateStore
    - Fallback resolution for archived tickets in compileL1L7EvidenceIndex
key_files:
  created:
    - tests/state-matrix-sync.test.ts
    - tests/e2e-v2-golden-path.test.ts
  modified:
    - src/deploy/evidence-index.ts
    - CLAUDE.md
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
decisions:
  - Added archived ticket fallback lookup via listTickets({ includeArchived: true }) in compileL1L7EvidenceIndex to support post-Done inspection without re-creating active ticket files
  - Realigned CLAUDE.md stack definition completely to file-backed StateStore (node:fs) and LaneManager (p-queue), removing all stale better-sqlite3 and drizzle-orm references
metrics:
  duration: 6m
  completed_date: "2026-09-18"
  tasks_completed: 3
  files_changed: 7
---

# Phase 07 Plan 01: Docs Realignment & E2E Proof Summary

**End-to-end 9-step simulation of Golden Path v2 on file-backed StateStore with automated ROADMAP.md state matrix drift guard and documentation realignment.**

## Key Changes

### 1. State Matrix Sync & Documentation Drift Guard (`tests/state-matrix-sync.test.ts`)
- Implemented pure Node.js parser checking `## Authoritative ADO State Matrix (Golden Path v2 — 5 columns / 9 steps / L1–L7)` in `.planning/ROADMAP.md`.
- Asserts strict 9-row parity against `GOLDEN_PATH_V2` in `src/pipeline/taxonomy.ts` checking column, step name, actor emoji (`⚡` / `👤`), ADO wire state, evidence tiers (L1–L7), and key tags.
- Asserts zero occurrences of `better-sqlite3` and `drizzle-orm` in `CLAUDE.md` and verifies `StateStore` presence.
- Asserts `.planning/PROJECT.md` contains `5 columns, 9 actor-assigned steps, L1–L7 evidence`.

### 2. End-to-End 9-Step Simulation (`tests/e2e-v2-golden-path.test.ts`)
- Simulates fixture ticket #9901 advancing sequentially through all 9 steps:
  - Step 1 (Refinement): AI contract audit passes DoD, tags `[awaiting-scope-lock]`, persists L1 audit log.
  - Step 2 (Refinement): Human PM scope review approves scope lock, tags `[scope-locked]`, transitions to `Ready to Dev`.
  - Step 3 (Execution): Plan-Code-Test loop checks scope-locked guard, executes coder, and persists real L3 evidence.
  - Step 4 (Execution): Dev validate formats PR description and initiates PR.
  - Step 5 (Acceptance): TechLead approval verdict tags `[acceptance-approved]`, simulating PR merge to `Ready for QA`.
  - Step 6 (Acceptance): Human QA staging verification passes, persisting QA evidence.
  - Step 7 (Release): Deployment preparation persists L5 readiness packet with migration risk and rollback command.
  - Step 8 (Release) & Step 9 (Retro): Active production smoke verification passes, telemetry observation passes, retrospective feedback loop generates takeaways, action items, runbook diff, and skill PR; compiles fail-closed L1–L7 evidence index, transitions ticket to `Done` with `[golden-path-complete]`, and archives ticket to `archive/9901.md`.
- Verifies all 7 evidence tiers non-null in StateStore, `compileL1L7EvidenceIndex` passes with `failClosed: true`, ADO update sets `System.State: Done`, and archive file contains retro takeaways and action items.

### 3. Documentation Sweep & Milestone v2.0 Finalization
- Swept `CLAUDE.md` to remove `better-sqlite3` and `drizzle-orm`, replacing with `StateStore (node:fs)` and `LaneManager (p-queue)`.
- Updated `.planning/PROJECT.md` marking all 5 active feature targets complete (`RESTRUCTURE`, `L7 EVIDENCE`, `PM SCOPE GATE`, `PROD SMOKE`, `RETRO OUTPUT`) and marking superseded decisions.
- Updated `.planning/REQUIREMENTS.md` marking `TAX-02` complete, bringing Milestone v2.0 to 19/19 (100%) completion.
- Updated `.planning/ROADMAP.md` marking Phase 7 and Plan 07-01 complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fallback lookup for archived tickets in `compileL1L7EvidenceIndex`**
- **Found during:** Task 2 E2E test execution.
- **Issue:** Step 9 archives the ticket file from `tickets/<id>.md` to `archive/<id>.md`. Calling `compileL1L7EvidenceIndex` on the completed ticket would throw `MissingEvidenceError` because `getTicketState` only checks active tickets.
- **Fix:** In `src/deploy/evidence-index.ts`, if `getTicketState` returns `null`, search `stateStore.listTickets({ includeArchived: true })`. If found in archive, compile the summary from the archived record without mutating the archived file.
- **Files modified:** `src/deploy/evidence-index.ts`
- **Commit:** `52b1ad9`

## Self-Check: PASSED

- [x] `tests/state-matrix-sync.test.ts` exists and passes
- [x] `tests/e2e-v2-golden-path.test.ts` exists and passes
- [x] All 46 test files in repository pass (`npm test`: 436/436 green)
- [x] Commits verified in git log:
  - `4424d7a`: `test(07-01): add automated state matrix sync and doc drift guard tests`
  - `52b1ad9`: `feat(07-01): implement end-to-end golden path v2 simulation test`
  - `8033bcc`: `docs(07-01): realign stack docs, sweep stale SQLite references and complete v2.0 requirements`
