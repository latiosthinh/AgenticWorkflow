---
phase: 03-execute-check-bounded-implementation-self-repair-verification
plan: 01
subsystem: execute
tags:
  - diff-ceiling
  - dependency-guard
  - coder-tools
  - test-immutability
  - assertion-checker
  - security
dependency_graph:
  requires:
    - 02-01 (Git worktree isolation and test file protection)
    - 02-02 (Dynamic MCP registry tools)
  provides:
    - Diff ceiling guard (<250 LOC) via git shortstat calculation (src/execute/diff-guard.ts)
    - Package dependency allowlist and acceptance criteria checker (src/execute/diff-guard.ts)
    - Bounded file tools and conventional commit utility (src/execute/coder.ts)
    - Baseline test immutability and assertion presence checker (src/test-runner/immutability.ts)
  affects:
    - 03-02 (Test runner executor and self-repair loop integration)
    - 03-03 (L3 evidence capture and Dev Done transition)
tech_stack:
  added: []
  patterns:
    - Cumulative git diff parsing with intent-to-add (git add -N .) support for untracked files
    - Package dependency comparison against ticket AC and allowlists
    - Bounded file operations preventing path traversal outside worktree
    - Conventional commit messages with work item trailer (AB#<id>)
    - Baseline test immutability verification via git diff --name-status
    - Test assertion verification requiring expect(...) or assert statements
key_files:
  created:
    - src/execute/diff-guard.ts
    - src/execute/coder.ts
    - src/test-runner/immutability.ts
    - tests/diff-ceiling.test.ts
    - tests/test-protection.test.ts
  modified: []
decisions:
  - "Used git add -N . before git diff --shortstat to ensure untracked additions in working tree count towards cumulative diff ceiling"
  - "Used inputSchema instead of parameters in createCoderTools for Vercel AI SDK v7 type alignment"
  - "Enforced strict path resolution prefix checks with case-insensitivity on Windows in coder tools to deny directory traversal"
  - "Enforced rejection of modifications, deletions, and renames targeting baseline test files while permitting new test additions"
metrics:
  duration: 6m
  completed_date: "2026-09-08"
  tasks: 2
  files: 5
---

# Phase 03 Plan 01: Bounded Code Generation & Test Immutability Guards Summary

Substantive achievement: Implemented the diff ceiling guard (<250 LOC cumulative diff limit), package dependency allowlist checker, bounded coder tools with path traversal guards, baseline test immutability validation, and test assertion presence checks.

## Key Changes

1. **Diff Ceiling & Package Dependency Guard (`IMPL-01`):**
   - Created `src/execute/diff-guard.ts`.
   - `calculateCumulativeDiff`: Queries `git diff --shortstat <baseCommit>` after marking untracked files with `git add -N .`, extracting files changed, insertions, deletions, and total LOC changed.
   - `assertDiffCeiling`: Rejects changes and throws `Diff ceiling exceeded: <N> LOC changed (ceiling is <250 LOC). Aborting implementation.` when cumulative LOC > 250.
   - `verifyPackageDependencies`: Inspects `dependencies` and `devDependencies` in `package.json`, flagging any added package that is neither mentioned in ticket acceptance criteria nor listed in the allowlist.

2. **Bounded Coder Tools & Conventional Commit (`IMPL-01`):**
   - Created `src/execute/coder.ts`.
   - `createCoderTools`: Exports Vercel AI SDK `tool()` instances (`createFile`, `editFile`, `deleteFile`) with strict path traversal checks (`assertInsideWorktree`) ensuring no operation escapes the worktree root.
   - `commitImplementation`: Stages all worktree changes and commits with conventional format `${type}(#${workItemId}): ${message}\n\nAB#${workItemId}`.

3. **Test Immutability Guard & Assertion Presence (`IMPL-02`):**
   - Created `src/test-runner/immutability.ts`.
   - `checkTestImmutability`: Parses `git diff --name-status` output against baseline test files, rejecting any line with status `M` (modified), `D` (deleted), or `R` (renamed) touching baseline test assertions. Newly added test files (`A`) are permitted and tracked in `newTestFiles`.
   - `hasValidAssertions`: Verifies test file content contains valid `expect(...)` or `assert(...)` statements to reject dummy or empty test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Git diff shortstat missing untracked files**
- **Found during:** Task 1
- **Issue:** `git diff --shortstat` only inspects tracked files, ignoring newly created files before `git add`.
- **Fix:** Added `git add -N .` before calling `git diff --shortstat` to register new files as intent-to-add so full insertions are counted.
- **Files modified:** `src/execute/diff-guard.ts`
- **Commit:** `0040974`

**2. [Rule 1 - Bug] AI SDK v7 tool parameters schema type error**
- **Found during:** Task 1 / tsc verification
- **Issue:** Vercel AI SDK v7 types define `inputSchema` rather than `parameters` on `tool()`, causing TS2769 and TS7031 compiler errors.
- **Fix:** Switched tool definition schema key from `parameters` to `inputSchema`.
- **Files modified:** `src/execute/coder.ts`
- **Commit:** `ba25e5b`

## Verification Results

Automated unit tests verified:
- `npx vitest run tests/diff-ceiling.test.ts tests/test-protection.test.ts` (20/20 tests passing)
- Full project test suite: `npx vitest run` (111/111 tests passing across 13 test files)
- Full TypeScript compiler check: `npx tsc --noEmit` (0 errors)

## Self-Check: PASSED

- FOUND: `src/execute/diff-guard.ts`
- FOUND: `src/execute/coder.ts`
- FOUND: `src/test-runner/immutability.ts`
- FOUND: `tests/diff-ceiling.test.ts`
- FOUND: `tests/test-protection.test.ts`
- FOUND commit: `0040974`
- FOUND commit: `ba25e5b`
- FOUND commit: `8361050`
