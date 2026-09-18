---
phase: 01-statestore-migration
reviewed: "2026-09-17T18:30:00Z"
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/state/types.ts
  - src/state/store.ts
  - src/state/index.ts
  - src/state/test-harness.ts
  - src/queue/lane-manager.ts
  - src/ingress/routes.ts
  - src/auditor/worker.ts
  - src/plan/checkpoint.ts
  - src/plan/watchdog.ts
  - src/accept/breaker.ts
  - src/qa/breaker.ts
  - src/qa/runner.ts
  - src/qa/worker.ts
  - src/execute/worker.ts
  - src/execute/router.ts
  - src/execute/rework-worker.ts
  - src/test-runner/evidence.ts
  - src/deploy/worker.ts
  - src/deploy/telemetry.ts
  - src/deploy/evidence-index.ts
  - src/learn/harvester.ts
  - src/learn/worker.ts
findings:
  critical: 1
  warning: 7
  info: 3
  total: 11
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-17T18:30:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 01 migrated the orchestrator's persistence layer from SQLite (`better-sqlite3`, `drizzle-orm`) to a file-backed `StateStore` utilizing JSON frontmatter documents in `data/state/tickets/<id>.md`, kernel-level atomic `wx` deduplication markers in `data/state/dedup/<id>-<rev>.json`, and single-writer concurrency control via `AsyncLocalStorage` and `p-queue`.

All 36 vitest test suites (312 tests) pass green. However, rigorous static analysis revealed 1 critical data loss vulnerability on Windows in `writeCrashAtomicSync`, 7 warnings covering cross-ticket ID collisions in checkpoint lookups, an unhandled floating promise in the router, a watchdog race condition, numeric falsy coercion in the learn harvester, missing ticket archival in the deployment pipeline, orphaned temporary dedup marker leaks, and unhandled JSON parsing in evidence compilation.

---

## Critical Issues

### CR-01: Permanent Data Loss Risk in Windows Crash-Atomic Write

**File:** `src/state/store.ts:46-59`
**Issue:**
In `writeCrashAtomicSync`, when running on Windows (`process.platform === 'win32'`), `fs.unlinkSync(targetPath)` explicitly deletes the target file before calling `fs.renameSync(tempPath, targetPath)`:
```ts
  try {
    if (process.platform === 'win32' && fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
    throw err;
  }
```
If `fs.renameSync` fails (e.g. Windows file lock, antivirus/indexer handle, or disk error), execution enters the `catch (err)` block, which unlinks `tempPath`. Because `targetPath` was already deleted by `unlinkSync` and `tempPath` is now deleted by the catch block, **both copies of the file are permanently deleted**, resulting in total data loss. Additionally, unlinking `targetPath` before `renameSync` opens an unatomic race window where concurrent readers encounter `ENOENT`.

**Fix:**
Avoid unlinking the target file before renaming. On modern Windows NTFS, `renameSync` overwrites existing files atomically when files reside on the same filesystem volume. If Windows fallback is required, use a `.bak` backup file or ensure `tempPath` is never unlinked if `targetPath` has already been deleted:

```ts
function writeCrashAtomicSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  const tempName = `.${path.basename(targetPath)}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  const tempPath = path.join(dir, tempName);

  fs.writeFileSync(tempPath, content, 'utf8');

  let targetUnlinked = false;
  try {
    try {
      fs.renameSync(tempPath, targetPath);
    } catch (renameErr: any) {
      if (process.platform === 'win32' && (renameErr.code === 'EPERM' || renameErr.code === 'EEXIST')) {
        const backupPath = `${targetPath}.bak.${Date.now()}`;
        if (fs.existsSync(targetPath)) {
          fs.renameSync(targetPath, backupPath);
          targetUnlinked = true;
        }
        fs.renameSync(tempPath, targetPath);
        if (targetUnlinked && fs.existsSync(backupPath)) {
          try { fs.unlinkSync(backupPath); } catch {}
        }
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    // Only clean up tempPath if targetPath was not destroyed
    if (!targetUnlinked && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
    throw err;
  }
}
```

---

## Warnings

### WR-01: Non-Unique Checkpoint IDs and Ambiguous Cross-Ticket Lookup

**File:** `src/plan/checkpoint.ts:74-80, 123-129`
**Issue:**
In `createPlanCheckpoint`, checkpoint IDs are assigned locally per ticket as `draft.planCheckpoints.length + 1` (`src/plan/checkpoint.ts:22`). Consequently, checkpoint `id: 1` exists across every ticket in the system.
In `lockPlanCheckpoint` and `updateCheckpointStatus`, when called without an active `laneContext`, the code falls back to scanning all tickets:
```ts
  if (!targetWorkItemId) {
    const tickets = await stateStore.listTickets();
    const matching = tickets.find((t) => t.planCheckpoints?.some((cp) => cp.id === id));
    if (matching) {
      targetWorkItemId = matching.workItemId;
    }
  }
```
Because almost every ticket has a checkpoint with `id: 1`, `tickets.find(...)` matches the first ticket returned by `listTickets()`, modifying and locking the wrong ticket.

**Fix:**
Require `workItemId` as a parameter in `lockPlanCheckpoint` and `updateCheckpointStatus`, or assign globally unique checkpoint IDs (such as `${data.workItemId}-${draft.planCheckpoints.length + 1}` or a UUID):

```ts
export async function lockPlanCheckpoint(
  id: number | undefined,
  answers: string,
  updatedPlan?: string,
  explicitWorkItemId?: number
): Promise<void> {
  if (id === undefined) return;

  let targetWorkItemId = explicitWorkItemId ?? laneContext.getStore()?.workItemId;
  if (!targetWorkItemId) {
    throw new Error(`Cannot lock checkpoint ${id}: workItemId must be provided when outside active lane.`);
  }
  // ...
```

---

### WR-02: Missing `await` on `resetCircuitBreaker` in Work Item Router

**File:** `src/execute/router.ts:79`
**Issue:**
In `routeWorkItemEvent`, when `verdict.type === 'reset_rework'`, `resetCircuitBreaker(workItemId)` is invoked without `await`:
```ts
78:     if (verdict.type === 'reset_rework') {
79:       resetCircuitBreaker(workItemId);
80:       stateStore.updateDedupStatus(workItemId, revId, 'completed');
```
Because `resetCircuitBreaker` returns `Promise<void>` and performs asynchronous `updateTicketState` disk operations, the router completes deduplication and returns before the circuit breaker reset finishes on disk. Any error thrown inside `resetCircuitBreaker` results in an unhandled promise rejection.

**Fix:**
```ts
    if (verdict.type === 'reset_rework') {
      await resetCircuitBreaker(workItemId);
      stateStore.updateDedupStatus(workItemId, revId, 'completed');
```

---

### WR-03: Race Condition in Watchdog Checkpoint Escalation & Reminder

**File:** `src/plan/watchdog.ts:32-54, 61-77`
**Issue:**
`checkPlanCheckpointTimeouts` updates Azure DevOps work items via `adoClient.updateWorkItem` outside `runInLane(ticket.workItemId)`. If a developer answers a checkpoint on ADO concurrently, the incoming webhook handler runs `processWorkItemExecute` within `runInLane`. The watchdog's out-of-lane ADO call sets the ticket to `Blocked`. Subsequently, when the watchdog's queued mutator executes in `runInLane`, it does not check whether `match.status` is still `'pending_human_input'`, overwriting `match.status = 'blocked'` over the answered/locked checkpoint state.

**Fix:**
Verify `match.status === 'pending_human_input'` inside the lane mutation, and only update ADO if the checkpoint remains pending:

```ts
          await workItemQueueManager.runInLane(ticket.workItemId, async () => {
            const current = await stateStore.getTicketState(ticket.workItemId);
            const match = current?.planCheckpoints.find((c) => c.id === cp.id);
            if (!match || match.status !== 'pending_human_input' || match.escalatedAt) {
              return;
            }

            await adoClient.updateWorkItem(ticket.workItemId, [
              { op: Operation.Replace, path: '/fields/System.State', value: 'Blocked' },
              { op: Operation.Add, path: '/fields/System.History', value: escalationComment },
            ]);

            await stateStore.updateTicketState(ticket.workItemId, (draft) => {
              const target = draft.planCheckpoints.find((c) => c.id === cp.id);
              if (target && target.status === 'pending_human_input') {
                target.status = 'blocked';
                target.escalatedAt = new Date().toISOString();
                target.updatedAt = new Date().toISOString();
              }
            });
          });
```

---

### WR-04: Falsy Numeric Coercion Corrupting Zero Passing Tests in Lifecycle Harvester

**File:** `src/learn/harvester.ts:35`
**Issue:**
In `harvestTicketLifecycleData`, line 35 uses logical OR `||`:
```ts
35:     unitTestsPassed: l3?.passed || 1,
```
If a test suite ran and 0 tests passed (`l3.passed === 0`), `0 || 1` evaluates to `1` because `0` is falsy in JavaScript. This falsely records that 1 test passed instead of 0.

**Fix:**
Use nullish coalescing `??` instead of `||`:
```ts
    unitTestsPassed: l3?.passed ?? 1,
    unitTestsTotal: l3?.totalTests ?? 1,
```

---

### WR-05: Missing Ticket Archival in Production Pipeline Workflow

**File:** `src/deploy/worker.ts:170-188`
**Issue:**
Phase 1 requirements (STATE-04, 01-04-SUMMARY.md) specify that completed tickets must be archived to `data/state/archive/` via `stateStore.archiveTicket(workItemId)` to preserve $O(\text{active tickets})$ scan performance. However, `archiveTicket` is never called anywhere in `src/`. When a ticket reaches `Done`, it stays in `data/state/tickets/` permanently. Over time, `stateStore.listTickets()` must read and parse every historic ticket ever processed on every watchdog scan.

**Fix:**
Invoke `archiveTicket` after all post-Done workflows (such as `processLearningFeedbackLoop`) complete, or schedule a periodic archival sweeper for tickets marked `Done` with `updatedAt` older than a retention threshold:

```ts
  // In src/deploy/worker.ts after background learning feedback loop completes:
  processLearningFeedbackLoop(workItemId)
    .catch((err) => {
      console.warn(`[deploy-worker] Background learning feedback loop failed for #${workItemId}:`, err?.message);
    })
    .finally(async () => {
      await stateStore.archiveTicket(workItemId).catch((err) => {
        console.warn(`[deploy-worker] Failed to archive ticket #${workItemId}:`, err?.message);
      });
    });
```

---

### WR-06: Crash-Atomic Temporary Files in `dedupDir` Never Purged

**File:** `src/state/store.ts:353-356`
**Issue:**
`updateDedupStatus` writes updates using `writeCrashAtomicSync`, which creates sibling temporary files formatted as `.${workItemId}-${revId}.json.tmp.*` inside `data/state/dedup/`. In `purgeOldDedupEvents`:
```ts
354:       for (const file of files) {
355:         if (!file.endsWith('.json') || file.startsWith('.')) {
356:           continue;
357:         }
```
Any temporary dotfiles left behind after unhandled crashes or reboots are skipped and will never be deleted, accumulating in `dedup/` indefinitely.

**Fix:**
Update `purgeOldDedupEvents` to also sweep expired `.tmp.*` files:
```ts
      for (const file of files) {
        const isDedupJson = file.endsWith('.json') && !file.startsWith('.');
        const isOrphanTmp = file.includes('.json.tmp.');
        if (!isDedupJson && !isOrphanTmp) {
          continue;
        }
        const fullPath = path.join(this.dedupDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs < cutoffMs) {
            fs.unlinkSync(fullPath);
            changes++;
          }
        } catch {}
      }
```

---

### WR-07: Unchecked JSON Parsing in `compileL1L6EvidenceIndex`

**File:** `src/deploy/evidence-index.ts:64`
**Issue:**
Line 64 attempts to parse `l1Record.reasons`:
```ts
64:   const l1Reasons: string[] = l1Record?.reasons ? JSON.parse(l1Record.reasons) : ['Definition of Done verified'];
```
If `l1Record.reasons` contains a non-JSON string or malformed payload, `JSON.parse` throws an unhandled `SyntaxError`, crashing `compileL1L6EvidenceIndex` and preventing the work item from completing the deployment transition to `Done`.

**Fix:**
```ts
  let l1Reasons: string[] = ['Definition of Done verified'];
  if (l1Record?.reasons) {
    try {
      const parsed = JSON.parse(l1Record.reasons);
      l1Reasons = Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      l1Reasons = [l1Record.reasons];
    }
  }
```

---

## Info

### IN-01: Uncalled `clearLane` in `WorkItemQueueManager`

**File:** `src/queue/lane-manager.ts:27-32`
**Issue:**
`clearLane(workItemId)` is defined to delete idle `PQueue` instances from `this.lanes`, but is never invoked. As tickets are processed, empty `PQueue` objects accumulate in memory.
**Fix:** Call `this.clearLane(workItemId)` in `runInLane` when `lane.size === 0 && lane.pending === 0`.

### IN-02: `archiveTicket` Does Not Enforce Single-Writer Lane

**File:** `src/state/store.ts:251-263`
**Issue:**
`archiveTicket(workItemId)` moves the ticket Markdown file on disk without calling `verifyLane(workItemId)`. If called while an asynchronous worker is in the middle of writing state, file operations could conflict.
**Fix:** Add `verifyLane(workItemId)` or wrap execution in `workItemQueueManager.runInLane(workItemId)`.

### IN-03: Loose `any` Type on `recordL3Evidence` Input

**File:** `src/test-runner/evidence.ts:24`
**Issue:**
`recordL3Evidence(data: any)` bypasses TypeScript type validation.
**Fix:** Define and use a typed interface (e.g. `L3EvidenceInput`).

---

_Reviewed: 2026-09-17T18:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

## CODE REVIEW COMPLETE
