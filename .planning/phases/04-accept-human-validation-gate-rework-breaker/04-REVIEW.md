---
phase: 04-accept-human-validation-gate-rework-breaker
reviewed: 2026-09-09T09:05:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/accept/breaker.ts
  - src/accept/envelope.ts
  - src/accept/packet.ts
  - src/accept/urls.ts
  - src/accept/verdict.ts
  - src/ado/work-item.ts
  - src/config/env.ts
  - src/db/index.ts
  - src/db/schema.ts
  - src/execute/rework-worker.ts
  - src/execute/router.ts
  - src/sandbox/worktree.ts
  - tests/acceptance-packet.test.ts
  - tests/rework-breaker.test.ts
  - tests/rework-integration.test.ts
  - tests/verdict-detector.test.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-09-09T09:05:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Reviewed 16 files across `src/` and `tests/` implemented in Phase 4. Core infrastructure successfully delivers the Dev Done Acceptance Packet formatter with bot loop shields, shared SQLite rework circuit breaker capped at 2 bounces across gates, human acceptance verdict detector with state/token analysis, cumulative rework envelope with LOC budgeting, task branch resumption in ephemeral worktrees, and full router integration.

Zero critical defects identified. Four warnings require attention:
1. `dedupEvents` records are left in permanent `pending` state when `processWorkItemRework` exits early on any of the five guarded failure conditions (diff ceiling, unauthorized dependencies, immutability, missing assertions, repair exhaustion).
2. `router.ts` fetches current work item details without passing `revId`, leading to revision mismatch and missing `System.History` in production ADO API calls.
3. `formatReworkPrompt` interpolates user feedback and acceptance criteria without XML escaping, risking prompt injection and XML boundary escape.
4. `baseRef` resolution falling back to `'HEAD'` in `rework-worker.ts` causes `merge-base` to evaluate to `HEAD`, resetting prior diff tracking to 0 LOC and bypassing the cumulative diff ceiling.

Five info items cover cleaning `[rework-escalated]` tags on reset, redundant index on primary key, redundant ADO round-trip, overly broad return type in URL resolver, and missing live model invocation stub in rework worker.

---

## Warnings

### WR-01: `dedupEvents` Left in `pending` State on Early Blocked Returns in `processWorkItemRework`

**File:** `src/execute/rework-worker.ts:113-122, 154-163, 168-177, 184-193, 216-225`
**Issue:** When `processWorkItemRework` encounters any of the five validation failures:
- Diff ceiling exceeded (`cumulativeDiff.totalLoc > maxLoc`)
- Unauthorized package dependencies (`!pkgDiffValid`)
- Test immutability violation (`!immutability.valid`)
- New test file lacking assertions (`!hasValidAssertions(content)`)
- Test repair budget exhaustion (`!repairResult.success`)

The function correctly invokes `flagTicketBlocked` and `cleanupWorktree`, and calls `return;`. However, because `db.update(dedupEvents).set({ status: 'completed' })` is only located at line 284 (the success path), and the `catch` block (line 298) is bypassed, the corresponding `dedupEvents` row remains permanently stuck in `status: 'pending'` until the 7-day TTL cleanup.
**Fix:**
Update `dedupEvents` to `'completed'` (or `'failed'`) before each early return:
```typescript
db.update(dedupEvents)
  .set({ status: 'completed' })
  .where(
    and(
      eq(dedupEvents.workItemId, workItemId),
      eq(dedupEvents.revId, revId)
    )
  )
  .run();
```

---

### WR-02: Missing Revision ID in `getWorkItemDetails` in `router.ts` Causes State & History Inconsistency

**File:** `src/execute/router.ts:28`
**Issue:** `routeWorkItemEvent` receives `(workItemId, revId)`. To determine the previous state, it calls `getWorkItemDetails(workItemId, revId - 1)`. However, for the current work item, line 28 calls `getWorkItemDetails(workItemId)` without `revId`. In Azure DevOps REST API, `getWorkItem(id)` does not include `System.History` in `fields` (comments are stored per-revision). Furthermore, if another revision occurred between webhook dispatch and queue execution, `workItem.state` reflects the latest state rather than the state at `revId`, causing inaccurate transition comparison against `revId - 1`.
**Fix:**
Pass `revId` to `getWorkItemDetails`:
```typescript
// src/execute/router.ts:28
const workItem = await getWorkItemDetails(workItemId, revId);
```

---

### WR-03: Unescaped User Content in XML Prompt Envelope Risks Boundary Escape

**File:** `src/accept/envelope.ts:17-27`
**Issue:** `formatReworkPrompt` directly interpolates `envelope.title`, `envelope.originalAcceptanceCriteria`, and `envelope.reviewFeedback` into `<original_acceptance_criteria>` and `<reviewer_feedback>` XML sections. If a human reviewer's comment or ticket AC includes closing XML tags (e.g. `</reviewer_feedback>`), it prematurely terminates the XML tag and allows prompt injection. In contrast, `src/auditor/prompt.ts` safely utilizes `escapeXml()`.
**Fix:**
Add XML escaping helper and sanitize user inputs before interpolation:
```typescript
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// In formatReworkPrompt:
const feedbackItems = envelope.reviewFeedback
  .map((f, i) => `Feedback #${i + 1}:\n${escapeXml(f)}`)
  .join('\n\n');
```

---

### WR-04: `baseRef` Fallback to `'HEAD'` in `rework-worker.ts` Resets Diff Ceiling Tracking

**File:** `src/execute/rework-worker.ts:74, 88`
**Issue:** `candidates = ['origin/master', 'main', 'master', 'HEAD']`. In repositories where the default branch is not named `main` or `master` (e.g. `develop` or custom trunk), `baseRef` falls back to `'HEAD'`. `git merge-base HEAD HEAD` evaluates to `HEAD`. Consequently, `calculateCumulativeDiff` against `baseCommit` calculates diff relative to `HEAD` (the latest commit of the branch before rework), resetting `priorDiffStat` to 0 LOC and bypassing the cumulative 250 LOC budget ceiling across multiple turns.
**Fix:**
Resolve base branch dynamically via `git remote show origin` or throw an explicit configuration error rather than falling back to `'HEAD'`:
```typescript
// Avoid HEAD in candidate list for merge-base calculation
const candidates = ['origin/main', 'origin/master', 'main', 'master'];
```

---

## Info

### IN-01: `[reset-rework]` Clears SQLite Counter But Leaves `[rework-escalated]` Tag in ADO

**File:** `src/execute/router.ts:43-53`
**Issue:** When `detectAcceptanceVerdict` detects `[reset-rework]`, `router.ts` resets `reworkCycles` in SQLite via `resetCircuitBreaker(workItemId)`. However, it does not update ADO to remove the `[rework-escalated]` tag that was applied during escalation, leaving the work item marked as escalated on the ADO board.
**Fix:**
```typescript
if (verdict.type === 'reset_rework') {
  resetCircuitBreaker(workItemId);
  await updateWorkItemTags(workItemId, undefined, '[rework-escalated]');
  db.update(dedupEvents)
...
```

---

### IN-02: Redundant Compound Index on Primary Key in `rework_cycles` Table

**File:** `src/db/schema.ts:100`, `src/db/index.ts:89`
**Issue:** `reworkCycles` defines `workItemId: integer('work_item_id').primaryKey()`. In SQLite, `INTEGER PRIMARY KEY` creates an automatic unique index on `work_item_id`. Index `idx_rework_cycles_lookup` on `(work_item_id, bounce_count)` is redundant because `work_item_id` lookups are already indexed as unique.
**Fix:** Remove `index('idx_rework_cycles_lookup').on(table.workItemId, table.bounceCount)` to eliminate unnecessary write overhead.

---

### IN-03: Redundant ADO Round-Trip in `escalateReworkToBlocked`

**File:** `src/ado/work-item.ts:209-216`, `src/execute/router.ts:72`
**Issue:** `routeWorkItemEvent` already fetched `workItem` with `workItem.tags`. When `!breaker.allowed`, it calls `escalateReworkToBlocked(workItemId, breaker.currentCount)`, which re-fetches `getWorkItemDetails(workItemId)` just to read `details.tags`.
**Fix:** Accept optional `currentTags?: string` in `escalateReworkToBlocked`:
```typescript
export async function escalateReworkToBlocked(
  workItemId: number,
  bounceCount: number,
  currentTags?: string
): Promise<any> {
  const tags = currentTags ?? (await getWorkItemDetails(workItemId)).tags;
  const patchDoc = buildEscalationPatch(workItemId, bounceCount, tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}
```

---

### IN-04: `resolvePrUrl` Return Type Contains Unnecessary `| undefined`

**File:** `src/accept/urls.ts:11`
**Issue:** `resolvePrUrl` return type signature is `string | undefined`, but both branches (`template` replacement and `${env.ADO_ORG_URL}/_git...` fallback) always return a `string`.
**Fix:** Narrow return type from `string | undefined` to `string`.

---

### IN-05: Rework Worker Lacks Live Model Code Editing Implementation Outside Mocks

**File:** `src/execute/rework-worker.ts:106-108`
**Issue:** Similar to `worker.ts` from Phase 3, `processWorkItemRework` only executes code edits when `options?.mockCodeEdit` is provided. When omitted in live production execution, it skips code generation and relies entirely on `executeRepairLoop`.
**Fix:** Wire `generateText` / `streamText` from Vercel AI SDK using `createCoderTools(worktreePath)` and `reworkPrompt` when `mockCodeEdit` is undefined.

---

_Reviewed: 2026-09-09T09:05:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
