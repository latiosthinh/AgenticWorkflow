# Phase 6: QA — Verification Loop - Research

**Phase:** 06 - QA — Verification Loop
**Confidence:** HIGH

## Executive Summary

Phase 6 implements post-merge integration verification with deterministic failure handling across four requirements:
- **QA-01**: "Ready for QA" triggers integration/e2e suite on staging.
- **QA-02**: 2-strike flake filter requiring consecutive identical failures before bounce.
- **QA-03**: QA failure transitions work item to "In Dev" with reproduction logs + diagnostics (bounce cap 2, then human escalation).
- **QA-04**: QA pass transitions work item to "Ready to Deploy" + QA evidence summary.

## Stack & Architecture Alignment

### Existing Reusable Assets
- `src/queue/lane-manager.ts`: `workItemQueueManager` serializes operations per work item lane.
- `src/sandbox/worktree.ts`: `createWorktree` / `cleanupWorktree` provides isolated git worktree environments.
- `src/sandbox/runner.ts`: `runInWorktree` provides process execution with timeout and credential scrubbing.
- `src/ado/work-item.ts`: `updateWorkItem`, `getWorkItem`, `addWorkItemComment` for ADO API operations.
- `src/ado/formatter.ts`: loop shield comments (`<!-- [automated-agent] -->`) and badge formatting.
- `src/accept/breaker.ts`: circuit breaker pattern for tracking bounces.
- `src/db/schema.ts` & `src/db/index.ts`: SQLite with Drizzle ORM for local persistent state.

### New Database Tables Needed
1. `qa_runs`:
   - `id`: integer primary key autoincrement
   - `workItemId`: integer not null
   - `runIndex`: integer not null (1 or 2)
   - `strikeCount`: integer not null default 0
   - `status`: text not null ('passed' | 'failed' | 'flaked')
   - `failedTestSignatures`: text (JSON array of strings)
   - `stdout`: text
   - `stderr`: text
   - `durationMs`: integer
   - `createdAt`: integer (timestamp)

2. `qa_bounces`:
   - `workItemId`: integer primary key
   - `bounceCount`: integer not null default 0
   - `lastBouncedAt`: integer
   - `escalated`: integer not null default 0

3. `qa_evidence`:
   - `workItemId`: integer primary key
   - `totalTests`: integer not null
   - `passedCount`: integer not null
   - `failedCount`: integer not null
   - `durationMs`: integer not null
   - `commitSha`: text not null
   - `stagingUrl`: text
   - `flakeCleared`: integer not null default 0
   - `createdAt`: integer (timestamp)

## 2-Strike Flake Filter Mechanics
1. **First Run**:
   - Executes configured test suite (`QA_TEST_COMMAND` or `npm run test:integration`) in worktree on merged commit.
   - If tests pass (exit code 0): Immediate success! Proceed to QA-04.
   - If tests fail (exit code != 0): Extract normalized failure signatures (`testFilePath:::testName:::normalizedErrorMessage`).
2. **Immediate Second Run (Strike 2)**:
   - Run the suite again sequentially in fresh clean execution context.
   - If second run passes: Flake detected! Mark as `[qa-flake-cleared]`, record in QA evidence, proceed to QA-04.
   - If second run fails: Compare failure signatures between run 1 and run 2.
   - If failures are identical: 2-Strike confirmed! Genuine regression.
   - If failures differ: Treat as flaky/non-deterministic failure, rerun or log diagnostics.

## Circuit Breaker & Bounce Mechanics (QA-03)
1. Read/increment `qa_bounces` for `workItemId`.
2. If `bounceCount < 2`:
   - Post collapsible diagnostics comment with sanitized error stack, CLI reproduction command, and loop shield `<!-- [automated-agent] -->`.
   - Transition state to `In Dev` and apply tag `[qa-failed]`.
   - Re-trigger rework agent with structured `<qa_failure_diagnostic>` envelope.
3. If `bounceCount >= 2`:
   - QA bounce cap reached!
   - Post escalation comment alerting human QA/lead.
   - Transition state to `Blocked` with tag `[qa-escalated]`.

## Evidence Summary & Ready to Deploy (QA-04)
1. Write structured record to `qa_evidence` table.
2. Format sanitized HTML QA Evidence Summary comment with loop shield.
3. Transition work item state to `Ready to Deploy`, add tag `[qa-verified]`, remove tag `[qa-failed]`.

## Validation Architecture
- Test runner unit tests verifying 2-strike comparison logic.
- Integration tests with mocked ADO client verifying state transitions:
  - Clean pass -> `Ready to Deploy`
  - Flake on run 1, pass on run 2 -> `Ready to Deploy` + `[qa-flake-cleared]`
  - Identical fail on run 1 & 2 -> bounce 1 -> `In Dev`
  - Identical fail on bounce 2 -> bounce 2 -> `In Dev`
  - Identical fail on bounce 3 -> `Blocked` + `[qa-escalated]`
