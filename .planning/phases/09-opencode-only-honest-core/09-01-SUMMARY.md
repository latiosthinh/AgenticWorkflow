---
phase: 09-opencode-only-honest-core
plan: 01
subsystem: execute-core
tags: [mcp-removal, built-in-deletion, boot-validation, opencode-only]
dependency_graph:
  requires: []
  provides: [opencode-only-boot, mcp-deleted, built-in-deleted]
  affects: [worker.ts, rework-worker.ts, coder.ts, env.ts]
tech_stack:
  added: []
  removed: ["@ai-sdk/mcp", "@modelcontextprotocol/sdk"]
  patterns: [z.literal-boot-validation, execFileSync-path-check]
key_files:
  created: [tests/env-boot-validation.test.ts]
  modified: [src/config/env.ts, src/execute/coder.ts, src/execute/worker.ts, src/execute/rework-worker.ts, package.json, tests/diff-ceiling.test.ts, tests/provider.test.ts]
  deleted: [src/mcp/registry.ts, src/mcp/server.ts, src/mcp/types.ts, src/mcp/tools/common.ts, src/mcp/tools/frontend.ts, src/mcp/tools/backend.ts, src/mcp/tools/infra.ts, tests/mcp-registry.test.ts]
decisions:
  - "OPENCODE_BIN keeps default('opencode') with .pipe(refine) for PATH resolvability — removing default would break existing .env files and test harness"
metrics:
  duration: 13m
  completed: "2026-09-19"
  tasks: 2
  files_modified: 7
  files_deleted: 8
  files_created: 1
  tests_before: 489
  tests_after: 482
  tests_added: 4
  tests_deleted: 10
  deps_removed: 2
---

# Phase 9 Plan 01: Delete MCP Subsystem & Built-in Path Summary

Deleted MCP dead-wire subsystem (7 files, 2 deps, 7 tests) and built-in no-op coding path; made LOCAL_AGENT_TYPE=opencode required at boot with OPENCODE_BIN resolvability check.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Delete MCP subsystem + deps (CORE-03) | c5ea5c2 | ✅ |
| 2 | Delete built-in path + require opencode at boot (CORE-01) | bcbccbc | ✅ |

## What Changed

### Task 1: MCP Subsystem Deletion
- Deleted entire `src/mcp/` tree (registry.ts, server.ts, types.ts, tools/{common,frontend,backend,infra}.ts)
- Deleted `tests/mcp-registry.test.ts` (7 tests)
- Removed `@ai-sdk/mcp` and `@modelcontextprotocol/sdk` from package.json dependencies
- Removed all MCP references from `worker.ts` (import, session creation, close calls, catch cleanup)
- Ran `npm install` to update lockfile

### Task 2: Built-in Path Deletion + Boot Validation
- **env.ts**: `LOCAL_AGENT_TYPE` → `z.literal('opencode')` (no default — required, rejects all other values). `OPENCODE_BIN` → `z.string().default('opencode').pipe(z.string().min(1).refine(...))` with `which`/`where` PATH check (skipped in NODE_ENV=test).
- **coder.ts**: Deleted `createCoderTools` (45 lines) and `assertInsideWorktree` helper (25 lines). File now exports only `commitImplementation`.
- **worker.ts**: Removed `LOCAL_AGENT_TYPE === 'opencode'` conditionals — opencode path is now unconditional. Both the code-edit branch (line 83) and planner skip branch (line 393) simplified.
- **rework-worker.ts**: Same conditional cleanup (line 130).
- **diff-ceiling.test.ts**: Removed 3 `createCoderTools` tests (create/edit/delete, non-existent edit, traversal denial). Kept 1 `commitImplementation` test. Renamed describe block to "Conventional Commit".
- **provider.test.ts**: Updated default-values test to supply `LOCAL_AGENT_TYPE: 'opencode'` + `OPENCODE_BIN: 'opencode'` and assert the new required behavior.
- **NEW tests/env-boot-validation.test.ts**: 4 tests — unset LOCAL_AGENT_TYPE → throw, built-in → throw, opencode → pass, empty OPENCODE_BIN → throw.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] OPENCODE_BIN default preserved with .pipe() pattern**
- **Found during:** Task 2
- **Issue:** Plan specified `z.string().min(1)` (no default) for OPENCODE_BIN, but removing the default broke the module-level `EnvSchema.parse(process.env)` since existing .env files lack OPENCODE_BIN.
- **Fix:** Used `z.string().default('opencode').pipe(z.string().min(1).refine(...))` — preserves default while adding resolvability check.
- **Files modified:** src/config/env.ts
- **Commit:** bcbccbc

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| Boot with LOCAL_AGENT_TYPE unset → ZodError | ✅ (test: 'fails fast when LOCAL_AGENT_TYPE is unset') |
| Boot with LOCAL_AGENT_TYPE='built-in' → ZodError | ✅ (test: 'fails fast when LOCAL_AGENT_TYPE is built-in') |
| No `src/mcp/` directory; no MCP deps | ✅ (directory deleted, deps removed from package.json) |
| `createCoderTools` grep returns 0 in src/ and tests/ | ✅ (zero matches) |
| worker.ts and rework-worker.ts have no `=== 'built-in'` or `=== 'opencode'` conditionals | ✅ (zero matches) |
| Full test suite passes | ✅ (51 files, 482 tests, 0 failures) |
| `npx tsc --noEmit` clean | ✅ |

## Self-Check: PASSED

- [x] src/mcp/ does not exist
- [x] tests/mcp-registry.test.ts does not exist
- [x] tests/env-boot-validation.test.ts exists
- [x] Commits c5ea5c2 and bcbccbc exist in git log
- [x] No `createCoderTools` or `createDynamicMcpTools` in src/ or tests/
- [x] No `built-in` in src/config/env.ts
- [x] No `=== 'opencode'` or `=== 'built-in'` conditionals in worker.ts/rework-worker.ts
