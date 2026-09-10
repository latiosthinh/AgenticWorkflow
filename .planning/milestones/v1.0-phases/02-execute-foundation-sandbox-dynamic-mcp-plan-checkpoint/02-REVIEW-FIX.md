---
phase: 02-execute-foundation-sandbox-dynamic-mcp-plan-checkpoint
fixed_at: 2026-09-08T16:19:00Z
review_path: .planning/phases/02-execute-foundation-sandbox-dynamic-mcp-plan-checkpoint/02-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-09-08T16:19:00Z
**Source review:** .planning/phases/02-execute-foundation-sandbox-dynamic-mcp-plan-checkpoint/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 11
- Fixed: 11
- Skipped: 0

## Fixed Issues

### CR-01: Resumption Flow Fails in Production ADO Due to Missing `System.History` in `getWorkItem`

**Files modified:** `src/ado/client.ts`, `src/ado/work-item.ts`, `src/execute/worker.ts`, `tests/ado-client.test.ts`, `tests/plan-checkpoint.test.ts`
**Commit:** 791149d
**Applied fix:** Added `getRevision` to `AdoClient`, updated `getWorkItemDetails` to query specific revision if `revId` is provided, and passed `revId` from `processWorkItemExecute`.

### WR-01: Ephemeral Worktrees Leaked on Disk When Plans Have No Ambiguities

**Files modified:** `src/execute/worker.ts`
**Commit:** a5c1b83
**Applied fix:** Added `cleanupWorktree` to release ephemeral worktrees upon non-ambiguous plan checkpoint formulation.

### WR-02: Broad `[Plan Q&A]` Substring Check Discards Valid Human Developer Replies

**Files modified:** `src/execute/worker.ts`, `tests/plan-checkpoint.test.ts`
**Commit:** 82e1f40
**Applied fix:** Changed `isNonBot` check to match exact bot header prefixes rather than substring matching anywhere in history, allowing human comments that quote or mention `[Plan Q&A]`.

### WR-03: Unhandled Exception in Watchdog Loop Starves Remaining Checkpoints

**Files modified:** `src/plan/watchdog.ts`, `tests/plan-checkpoint.test.ts`
**Commit:** 4222c86
**Applied fix:** Wrapped checkpoint update loop body in individual `try/catch` block to log failures without interrupting subsequent timeouts in the batch.

### WR-04: Credential Scrubber Regex Misses `PASSWORD`, `PASSWD`, and `CREDENTIAL` Keys

**Files modified:** `src/sandbox/runner.ts`, `tests/runner.test.ts`
**Commit:** 0610ef8
**Applied fix:** Expanded `SENSITIVE_KEY_PATTERN` regex to cover `PASSWORD`, `PASSWD`, `CREDENTIAL`, `PRIVATE_KEY`, and `AUTH_KEY`.

### WR-05: `pruneOrphanedWorktrees` Not Registered on Startup

**Files modified:** `src/index.ts`
**Commit:** 2ce9065
**Applied fix:** Registered `pruneOrphanedWorktrees(process.cwd())` in `startServer()` on startup.

### WR-06: Known Application Secrets Not Passed to Dynamic MCP Tool Runner

**Files modified:** `src/execute/worker.ts`
**Commit:** 7b0a465
**Applied fix:** Passed `[env.ADO_PAT, env.OPENAI_API_KEY, env.ADO_WEBHOOK_SECRET]` into `createDynamicMcpTools` as `knownSecrets`.

### IN-01: Unhandled Exception in `routeWorkItemEvent` Leaves `dedupEvents` in `pending` State

**Files modified:** `src/execute/router.ts`, `tests/plan-checkpoint.test.ts`
**Commit:** ef19b68
**Applied fix:** Wrapped `routeWorkItemEvent` in `try/catch` block to mark dedup event status as `failed` if `getWorkItemDetails` throws.

### IN-02: Missing Indexes on `plan_checkpoints` Table

**Files modified:** `src/db/schema.ts`, `src/db/index.ts`
**Commit:** de1acb5
**Applied fix:** Added `idx_plan_checkpoints_lookup` on `(work_item_id, status)` and `idx_plan_checkpoints_status` on `status` in both Drizzle schema and SQLite initial migration DDL.

### IN-03: `protectTestFiles` Regex Lacks Case-Insensitive Flag

**Files modified:** `src/sandbox/worktree.ts`, `tests/worktree.test.ts`
**Commit:** eb682a2
**Applied fix:** Added case-insensitive `/i` flag to test file pattern regex.

### IN-04: Direct `console.log` in Worker Instead of Structured Logger

**Files modified:** `src/execute/worker.ts`
**Commit:** 435df25
**Applied fix:** Prefixed `console.log` with `[execute-worker]` structured log component tag.

---

_Fixed: 2026-09-08T16:19:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
