---
phase: 02-execute-foundation-sandbox-dynamic-mcp-plan-checkpoint
plan: 01
subsystem: sandbox
tags:
  - git-worktree
  - execa
  - subprocess
  - security
  - permissions
  - sandboxing
dependency_graph:
  requires: []
  provides:
    - Cross-platform path normalizer and slug generator (src/utils/paths.ts)
    - Ephemeral git worktree manager with read-only test locks (src/sandbox/worktree.ts)
    - Subprocess runner with 120s timeout, SIGTERM/SIGKILL cascade, credential scrubbing, and 50KB truncation (src/sandbox/runner.ts)
  affects:
    - 02-02 (Dynamic MCP registry tools execute inside worktree via runner)
    - 02-03 (Interactive plan checkpoint provisions and releases worktree)
    - Phase 03 (Autonomous code execution and testing inside ephemeral worktrees)
tech_stack:
  added:
    - simple-git@^3.36.0
    - execa@^10.0.1
  patterns:
    - Ephemeral git worktree isolation (.worktrees/ticket-{id}-{slug} on task/ticket-{id}-{slug})
    - Read-only file permission locks (0o444) for test assertion files with 0o666 restore before removal
    - Subprocess execution without shell (shell: false, extendEnv: false)
    - Sensitive key stripping (/(PAT|API_KEY|TOKEN|SECRET)/i) and regex token redaction
    - Signal cascade (SIGTERM with forceKillAfterDelay 2000ms SIGKILL)
key_files:
  created:
    - src/utils/paths.ts
    - src/sandbox/types.ts
    - src/sandbox/worktree.ts
    - src/sandbox/runner.ts
    - tests/worktree.test.ts
    - tests/runner.test.ts
  modified:
    - package.json
    - package-lock.json
    - .gitignore
decisions:
  - "Configured extendEnv: false on execa calls to ensure host process credentials cannot leak into subprocess environments"
  - "Configured test assertion files with 0o444 read-only permissions during worktree setup and restored 0o666 on teardown to prevent Windows NTFS EPERM deletion locks"
  - "Enforced 120s execution timeout with SIGTERM and 2000ms forceKill SIGKILL cascade, returning standard exit code 124 on timeout"
  - "Added .worktrees/ to .gitignore to prevent ephemeral worktree directories from polluting git repository status"
metrics:
  duration: 5m
  completed_date: "2026-09-08"
  tasks: 2
  files: 9
---

# Phase 02 Plan 01: Worktree Sandbox & Hardened Subprocess Runner Summary

Substantive achievement: Provisioned ephemeral git worktree isolation with read-only test assertion file locks and implemented a hardened execa subprocess runner enforcing 120s timeouts, SIGTERM/SIGKILL cascades, credential scrubbing, and 50KB output buffer limits.

## Key Changes

1. **Path Utilities & Types:**
   - Implemented `normalizePath` and `slugify` in `src/utils/paths.ts` for consistent POSIX/Windows path formatting and ticket branch naming.
   - Defined `WorktreeResult`, `WorktreeOptions`, `CommandOptions`, and `CommandResult` in `src/sandbox/types.ts`.

2. **Ephemeral Git Worktree Lifecycle (`SAND-01`):**
   - Created `src/sandbox/worktree.ts` utilizing `simple-git`.
   - `createWorktree`: Creates branch `task/ticket-${id}-${slug}` in `.worktrees/ticket-${id}-${slug}`, pruning stale worktrees and falling back to `HEAD` if base branch is unresolvable.
   - `protectTestFiles`: Recursively scans worktree for test files (`*.(test|spec).(ts|js|tsx|jsx)`) and applies `0o444` read-only permissions.
   - `cleanupWorktree`: Unprotects files with `0o666` (preventing Windows NTFS EPERM errors), removes worktree, prunes git worktrees, and optionally deletes task branches.
   - `pruneOrphanedWorktrees`: Sweeps `.worktrees` on startup and prunes directories untouched for > 2 hours.

3. **Hardened Process Runner (`SAND-02`):**
   - Created `src/sandbox/runner.ts` wrapping `execa`.
   - `sanitizeEnv`: Whitelists baseline OS variables (`PATH`, `HOME`, `USERPROFILE`, `NODE_ENV`, etc.) and strips any variable matching `/(PAT|API_KEY|TOKEN|SECRET)/i`.
   - Configured `extendEnv: false` to ensure no host process secrets leak into child process environments.
   - `scrubOutput`: Replaces `ghp_*`, `ado-*`, and `Bearer *` patterns, as well as explicit known secret strings, with `[REDACTED]`.
   - `truncateBuffer`: Truncates outputs exceeding 50KB with `\n[...truncated...]`.
   - `runCommand`: Executes with `shell: false`, `timeout: 120_000`, `killSignal: 'SIGTERM'`, `forceKillAfterDelay: 2000`, and `maxBuffer: 10MB`. Maps timeouts to `exitCode: 124` and `timedOut: true`.

## Verification Results

Automated test suites executed via Vitest:
- `tests/worktree.test.ts`: 4 passed (path normalization, slugification, worktree creation with 0o444 test lock, 0o666 unlock & cleanup, 2h orphan prune).
- `tests/runner.test.ts`: 8 passed (env scrubbing, token redaction, buffer truncation, stdout/stderr capture, host env leak prevention, timeout SIGTERM/SIGKILL cascade).
- Full suite (`npx vitest run`): 8 test files, 62 tests passed.
- Typecheck (`npx tsc`): Clean, 0 errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `extendEnv: false` to prevent host environment leak**
- **Found during:** Task 2 (testing `runCommand`)
- **Issue:** By default, `execa` merges `options.env` onto `process.env`. Host environment variables set in test runners (such as `ADO_PAT`) were inherited by child processes.
- **Fix:** Explicitly configured `extendEnv: false` in `execa` options so only the sanitized environment is exposed to child processes.
- **Files modified:** `src/sandbox/runner.ts`
- **Commit:** d5a8eba

**2. [Rule 2 - Missing Critical Functionality] Added `.worktrees/` to `.gitignore`**
- **Found during:** Task 1
- **Issue:** Ephemeral `.worktrees/` directory was not listed in `.gitignore`, causing git status untracked warnings.
- **Fix:** Appended `.worktrees/` to `.gitignore`.
- **Files modified:** `.gitignore`
- **Commit:** a9c1526

## Self-Check: PASSED

- FOUND: src/utils/paths.ts
- FOUND: src/sandbox/types.ts
- FOUND: src/sandbox/worktree.ts
- FOUND: src/sandbox/runner.ts
- FOUND: tests/worktree.test.ts
- FOUND: tests/runner.test.ts
- FOUND commit a9c1526: feat(02-01): provision isolated git worktrees with read-only test guardrails
- FOUND commit d5a8eba: feat(02-01): implement hardened process runner with credential scrubbing and signal cascades
