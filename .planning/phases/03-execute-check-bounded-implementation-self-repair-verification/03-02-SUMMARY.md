---
phase: 03-execute-check-bounded-implementation-self-repair-verification
plan: 02
subsystem: execute
tags:
  - test-runner
  - vitest-parser
  - stack-trace-pruner
  - self-repair
  - wip-branch
  - bounded-cycles
dependency_graph:
  requires:
    - 02-01 (Process runner with credential scrubbing and timeout)
    - 03-01 (Bounded coder tools and test immutability)
  provides:
    - Sandboxed local test execution runner (src/test-runner/executor.ts)
    - Vitest output parser and diagnostic stack trace pruner (src/test-runner/parser.ts)
    - Iterative self-repair loop with WIP branch fallback (src/execute/repair.ts)
    - Automated test suite for self-repair loop and WIP branch preservation (tests/repair-loop.test.ts)
  affects:
    - 03-03 (L3 verification evidence capture and Dev Done transitions)
tech_stack:
  added: []
  patterns:
    - Vitest summary parsing (total, passed, failed) with ANSI escape code stripping
    - Diagnostic stack frame pruning limiting to top 15 application frames while removing node_modules and node:internal
    - Bounded self-repair loop bounded between 1 and 5 cycles (default 3)
    - Offline deterministic mock execution in NODE_ENV === 'test'
    - Automatic git checkout of wip/ticket-{id} branch with committed uncommitted changes and AB#{id} trailer upon repair exhaustion
key_files:
  created:
    - src/test-runner/executor.ts
    - src/test-runner/parser.ts
    - src/execute/repair.ts
    - tests/repair-loop.test.ts
  modified: []
decisions:
  - "Stripped ANSI escape codes from stdout/stderr prior to Vitest summary and stack frame parsing"
  - "Enforced clamp on repair cycles between min 1 and max 5 (defaulting to 3)"
  - "Preserved uncommitted changes on budget exhaustion to branch wip/ticket-{id} with AB#{id} commit trailer"
metrics:
  duration: 5m
  completed_date: "2026-09-08"
  tasks: 2
  files: 4
---

# Phase 03 Plan 02: Sandboxed Test Runner, Diagnostic Pruner & Iterative Self-Repair Loop Summary

Substantive achievement: Implemented local test execution in isolated subprocesses with 120s timeout and credential redaction, Vitest failure diagnostic pruning to top 15 non-internal stack frames, and a bounded self-repair loop (1–5 cycles, default 3) that preserves work in progress on branch `wip/ticket-{id}` with `AB#{id}` commit trailer upon budget exhaustion.

## Key Changes

1. **Sandboxed Local Test Runner (`TEST-02`):**
   - Created `src/test-runner/executor.ts`.
   - `runLocalTests`: Invokes `runCommand` (`npm test` by default) with 120,000ms timeout, sanitized environment variables, and credential redaction against known secret patterns, returning structured `TestRunResult` (`passed`, `exitCode`, `stdout`, `stderr`, `timedOut`, `durationMs`).

2. **Diagnostic Stack Trace Pruner (`TEST-02`):**
   - Created `src/test-runner/parser.ts`.
   - `parseVitestSummary`: Extracts `passed`, `failed`, `totalTests`, and `durationMs` from Vitest output with ANSI escape code stripping.
   - `pruneTestDiagnostics`: Filters test stdout and stderr to capture failing test names (`FAIL ...`), assertion failure messages (`AssertionError: ...`), and application stack frames, stripping `node_modules` and `node:internal` frames while capping frames to at most 15 lines.

3. **Iterative Self-Repair Loop with WIP Branch Fallback (`TEST-02`):**
   - Created `src/execute/repair.ts`.
   - `executeRepairLoop`: Manages an iterative repair loop clamped to 1–5 cycles (default 3). Terminates immediately on cycle 0 or subsequent cycle if tests pass. In `NODE_ENV === 'test'`, supports deterministic offline simulation via `mockTestRunner`.
   - On budget exhaustion: Checks out local branch `wip/ticket-${workItemId}`, stages all uncommitted worktree changes, commits with message `wip: repair budget exhausted for ticket ${workItemId}\n\nAB#${workItemId}`, attempts remote push, and returns diagnostics containing parsed failure summaries and pruned stack frames.

4. **Automated Unit & Integration Test Suite:**
   - Created `tests/repair-loop.test.ts`.
   - Verified Vitest summary parsing and stack trace pruning (filtering internal/node_modules frames, limiting to 15 frames).
   - Verified test runner executor subprocess execution and exit code handling.
   - Verified immediate success on cycle 0, success on cycle > 0 after initial failure, loop boundary termination, cycle clamping (min 1, max 5), WIP branch checkout, and `AB#{id}` commit generation.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

Automated unit tests verified:
- `npx vitest run tests/repair-loop.test.ts` (9/9 tests passing)
- Full project test suite: `npx vitest run` (120/120 tests passing across 14 test files)
- Full TypeScript compiler check: `npx tsc --noEmit` (0 errors)

## Self-Check: PASSED

- FOUND: `src/test-runner/executor.ts`
- FOUND: `src/test-runner/parser.ts`
- FOUND: `src/execute/repair.ts`
- FOUND: `tests/repair-loop.test.ts`
- FOUND commit: `e8bba79`
- FOUND commit: `9849819`
