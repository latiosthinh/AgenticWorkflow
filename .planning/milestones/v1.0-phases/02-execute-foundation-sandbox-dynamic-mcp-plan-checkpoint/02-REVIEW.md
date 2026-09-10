---
phase: 02-execute-foundation-sandbox-dynamic-mcp-plan-checkpoint
reviewed: 2026-09-08T16:15:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - src/utils/paths.ts
  - src/sandbox/types.ts
  - src/sandbox/worktree.ts
  - src/sandbox/runner.ts
  - src/mcp/types.ts
  - src/mcp/server.ts
  - src/mcp/tools/common.ts
  - src/mcp/tools/frontend.ts
  - src/mcp/tools/backend.ts
  - src/mcp/tools/infra.ts
  - src/mcp/registry.ts
  - src/db/schema.ts
  - src/db/index.ts
  - src/ado/work-item.ts
  - src/plan/schema.ts
  - src/plan/formatter.ts
  - src/plan/planner.ts
  - src/plan/checkpoint.ts
  - src/plan/watchdog.ts
  - src/execute/worker.ts
  - src/execute/router.ts
  - src/index.ts
  - tests/worktree.test.ts
  - tests/runner.test.ts
  - tests/mcp-registry.test.ts
  - tests/planner.test.ts
  - tests/plan-checkpoint.test.ts
  - tests/ado-client.test.ts
findings:
  critical: 1
  warning: 6
  info: 4
  total: 11
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-08T16:15:00Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Reviewed source files and test suites created or modified in Phase 2 across Sandbox isolation, Dynamic MCP registry, and Plan Checkpoint orchestration subsystems. Overall architecture aligns well with specifications: simple-git worktree provisioning works, subprocess execution enforces environment stripping and process tree termination, and Fastify webhook routing connects auditor and execution pipelines.

However, 1 critical defect, 6 warnings, and 4 info items were identified:
- **Critical:** Live Azure DevOps REST API does not return `System.History` in standard work item GET responses (`adoClient.getWorkItem`). The resumption flow relies on `workItem.history` being populated, which will always be empty against real ADO servers and cause developer reply events to be skipped.
- **Warnings:** Ephemeral git worktrees are leaked on disk with read-only locks when plans have no ambiguities; `[Plan Q&A]` substring checks reject valid human replies quoting ticket text; unhandled exceptions in the watchdog loop starve pending checkpoints; environment scrubber regex omits common credential keys like `PASSWORD`; startup orphan worktree pruning is never invoked; and runtime secrets are omitted from runner sanitization.
- **Info:** Unhandled rejections in `routeWorkItemEvent` leave `dedupEvents` rows in permanent `pending` state; `plan_checkpoints` lacks SQLite indexes; test file regex misses case-insensitivity; and unformatted `console.log` statements are present.

---

## Critical Issues

### CR-01: Resumption Flow Fails in Production ADO Due to Missing `System.History` in `getWorkItem`

**File:** `src/ado/work-item.ts:104-117` and `src/execute/worker.ts:38-46`
**Issue:** `getWorkItemDetails(workItemId)` calls `adoClient.getWorkItem(workItemId)`. In Azure DevOps REST API, `System.History` is a write-only / revision field that is strictly omitted from standard `GET /_apis/wit/workitems/{id}` responses. Consequently, in live ADO, `workItem.history` is always `""`. When a developer replies to an `[awaiting-input]` ticket, `processWorkItemExecute` evaluates `history.length > 0` as `false` and skips processing, preventing plan resumption. The test passed only because `tests/plan-checkpoint.test.ts` mocked `getWorkItem` with synthetic `System.History` data in `fields`.
**Fix:** Add `getRevision` to `AdoClient` and query the specific revision `revId` to retrieve the comment added in that revision:

```typescript
// src/ado/client.ts
async getRevision(id: number, rev: number): Promise<WorkItem> {
  return withRetry(async () => {
    const witApi = await this.getWorkItemTrackingApi();
    return witApi.getRevision(id, rev);
  });
}

// src/ado/work-item.ts
export async function getWorkItemDetails(
  workItemId: number,
  revId?: number
): Promise<WorkItemDetails> {
  const workItem = revId
    ? await adoClient.getRevision(workItemId, revId)
    : await adoClient.getWorkItem(workItemId);
  const fields = workItem.fields || {};
  return {
    id: workItem.id ?? workItemId,
    rev: workItem.rev ?? fields['System.Rev'] ?? 1,
    title: fields['System.Title'] || '',
    description: fields['System.Description'] || '',
    acceptanceCriteria: fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
    state: fields['System.State'] || '',
    tags: fields['System.Tags'] || '',
    history: fields['System.History'] || '',
  };
}

// src/execute/worker.ts
export async function processWorkItemExecute(
  workItemId: number,
  revId: number
): Promise<void> {
  const workItem = await getWorkItemDetails(workItemId, revId);
  // ...
}
```

---

## Warnings

### WR-01: Ephemeral Worktrees Leaked on Disk When Plans Have No Ambiguities

**File:** `src/execute/worker.ts:177-214`
**Issue:** When a ticket has no ambiguities (`plan.hasAmbiguities === false`), `createWorktree` creates a worktree directory and branch with `0o444` read-only test locks. The ambiguous branch explicitly releases the worktree via `cleanupWorktree` (line 161), but the non-ambiguous branch posts the locked comment, closes MCP session, and returns without cleaning up or recording the worktree location. The directory remains on disk indefinitely until pruned.
**Fix:** Release the worktree upon completing plan formulation in Phase 2, or persist `worktreePath` to `planCheckpoints` for Phase 3:

```typescript
// src/execute/worker.ts line 203
await mcpSession.close();
mcpSession = undefined;

if (worktreeResult) {
  await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
  worktreeResult = undefined;
}
```

### WR-02: Broad `[Plan Q&A]` Substring Check Discards Valid Human Developer Replies

**File:** `src/execute/worker.ts:43-44`
**Issue:** `isNonBot` checks `!history.includes('[Plan Q&A]') && !history.includes('[Plan Q&amp;A]')`. If a human developer replies quoting the clarification email or writes "Regarding [Plan Q&A]: we will use PostgreSQL", this check returns `false`. The human reply is classified as a bot echo and discarded.
**Fix:** Validate non-bot comments using the `<!-- [automated-agent] -->` signature or match the exact header prefix rather than searching for the substring anywhere in text:

```typescript
// src/execute/worker.ts
const isNonBot =
  typeof history === 'string' &&
  history.length > 0 &&
  !history.includes('<!-- [automated-agent] -->') &&
  !history.trim().startsWith('### [Plan Q&A]');
```

### WR-03: Unhandled Exception in Watchdog Loop Starves Remaining Checkpoints

**File:** `src/plan/watchdog.ts:23-80`
**Issue:** In `checkPlanCheckpointTimeouts`, the `for (const cp of pending)` loop awaits `adoClient.updateWorkItem(...)` without an internal `try/catch`. If an ADO API call fails for one work item (e.g. ticket deleted or permission denied), the function throws and halts immediately. All subsequent checkpoints in the batch are skipped.
**Fix:** Wrap the loop body in an individual `try/catch`:

```typescript
// src/plan/watchdog.ts
for (const cp of pending) {
  try {
    // ... reminder / escalation logic
  } catch (itemErr) {
    console.error(`[plan-watchdog] Failed updating timeout for checkpoint ${cp.id} (ticket ${cp.workItemId}):`, itemErr);
  }
}
```

### WR-04: Credential Scrubber Regex Misses `PASSWORD`, `PASSWD`, and `CREDENTIAL` Keys

**File:** `src/sandbox/runner.ts:6`
**Issue:** `SENSITIVE_KEY_PATTERN = /(PAT|API_KEY|TOKEN|SECRET)/i` only checks for PAT, API_KEY, TOKEN, and SECRET. Environment variables like `DB_PASSWORD`, `PASSWORD`, `PASSWD`, `CREDENTIAL`, or `PRIVATE_KEY` are not stripped by `sanitizeEnv` and can leak to child processes.
**Fix:** Expand the regex pattern:

```typescript
// src/sandbox/runner.ts
export const SENSITIVE_KEY_PATTERN = /(PAT|API_KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|AUTH_KEY)/i;
```

### WR-05: `pruneOrphanedWorktrees` Not Registered on Startup

**File:** `src/index.ts:33-55`
**Issue:** Phase 2 plan specifications and architecture documents specify that `pruneOrphanedWorktrees` runs on server startup to clean up directories older than 2 hours. However, `src/index.ts` only registers `purgeOldDedupEvents` and starts the plan watchdog. Stale worktrees are never pruned on startup.
**Fix:** Invoke `pruneOrphanedWorktrees` in `startServer()`:

```typescript
// src/index.ts
import { pruneOrphanedWorktrees } from './sandbox/worktree.js';

// Inside startServer():
try {
  const prunedWorktrees = await pruneOrphanedWorktrees(process.cwd());
  console.log(`[worktree-prune] Startup sweep cleaned ${prunedWorktrees} orphaned worktrees`);
} catch (err) {
  console.error('[worktree-prune] Startup sweep failed:', err);
}
```

### WR-06: Known Application Secrets Not Passed to Dynamic MCP Tool Runner

**File:** `src/execute/worker.ts:133-136`
**Issue:** `createDynamicMcpTools` accepts `knownSecrets?: string[]` to scrub sensitive strings from subprocess stdout/stderr. In `src/execute/worker.ts`, `createDynamicMcpTools` is invoked without `knownSecrets`. Because Azure DevOps PATs and OpenAI keys don't match `SENSITIVE_VALUE_PATTERN` (`ghp_`, `Bearer`, `ado-`), any subprocess echoing these variables will leak them in unredacted form.
**Fix:** Pass configured secrets into `createDynamicMcpTools`:

```typescript
// src/execute/worker.ts
mcpSession = await createDynamicMcpTools({
  worktreePath: worktreeResult.worktreePath,
  tags,
  knownSecrets: [env.ADO_PAT, env.OPENAI_API_KEY, env.ADO_WEBHOOK_SECRET],
});
```

---

## Info

### IN-01: Unhandled Exception in `routeWorkItemEvent` Leaves `dedupEvents` in `pending` State

**File:** `src/execute/router.ts:8-35`
**Issue:** If `getWorkItemDetails(workItemId)` throws before dispatching to `processWorkItemAudit` or `processWorkItemExecute`, the event remains in `status: 'pending'` in SQLite rather than `'failed'`.
**Fix:** Wrap `routeWorkItemEvent` in a `try/catch` and mark `dedupEvents` as `'failed'` if fetching work item details fails.

### IN-02: Missing Indexes on `plan_checkpoints` Table

**File:** `src/db/schema.ts:31-53` and `src/db/index.ts:44-59`
**Issue:** Queries in `getPendingCheckpoint` and `checkPlanCheckpointTimeouts` filter by `(work_item_id, status)` and `status`. Without indexes on these columns, SQLite performs full table scans.
**Fix:** Add `CREATE INDEX IF NOT EXISTS idx_plan_checkpoints_lookup ON plan_checkpoints(work_item_id, status);`.

### IN-03: `protectTestFiles` Regex Lacks Case-Insensitive Flag

**File:** `src/sandbox/worktree.ts:27`
**Issue:** `/\.(test|spec)\.(ts|js|tsx|jsx)$/` is case-sensitive. On Windows and macOS, test files matching uppercase extensions (e.g. `.Test.ts`, `.SPEC.js`) will not be locked as read-only.
**Fix:** Add `/i` flag: `/\.(test|spec)\.(ts|js|tsx|jsx)$/i`.

### IN-04: Direct `console.log` in Worker Instead of Structured Logger

**File:** `src/execute/worker.ts:78-80`
**Issue:** `console.log` is used directly in `processWorkItemExecute` when locking plan instead of using the application logger or structured logging.
**Fix:** Replace with Pino logger or structured log output.

---

_Reviewed: 2026-09-08T16:15:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
