---
phase: 03-pm-scope-lock-gate
reviewed: 2026-09-17T20:50:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/scope/packet.ts
  - src/scope/verdict.ts
  - src/scope/gate.ts
  - src/scope/watchdog.ts
  - src/scope/index.ts
  - src/auditor/worker.ts
  - src/execute/router.ts
  - src/index.ts
  - src/state/types.ts
  - src/ado/work-item.ts
  - tests/scope-gate.test.ts
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-17T20:50:00Z  
**Depth:** standard  
**Files Reviewed:** 11  
**Status:** issues_found  

## Summary

Phase 03 implements Refinement Step 2 PM Scope-Lock Gate:
1. Parking audit-passed tickets on `New` with `[awaiting-scope-lock]; [audit-passed]` and posting formatted scope review packets (`src/scope/packet.ts`, `src/auditor/worker.ts`).
2. Multi-channel verdict detection (`approve`, `reject`, `reset_scope`) with bot echo suppression (`src/scope/verdict.ts`).
3. Refinement circuit breaker isolated from `reworkCycles`, limiting rejections to 2 and escalating 3rd rejection to `Blocked` (`src/scope/gate.ts`).
4. Background watchdog sweeping for 24h reminders, 72h escalations, and live ADO drop reconciliation (`src/scope/watchdog.ts`, `src/index.ts`).
5. Fail-closed Step 3 router guard refusing `In Dev` execution unless ticket scope is locked (`src/execute/router.ts`).

The core architecture correctly isolates refinement iteration counts from the downstream accept/rework breaker and provides comprehensive test coverage. However, two critical edge-case bugs and several behavioral gaps were detected:
- **Critical:** Resetting the scope breaker leaves stale `requestedAt` timestamps intact, causing the 72h watchdog timeout to immediately re-escalate the ticket back to `Blocked` on its very next run.
- **Critical:** In `detectScopeVerdict`, checking `!input.previousTags?.includes('[scope-locked]')` evaluates to `true` whenever `previousTags` is undefined (e.g. revision lookup failure or `revId === 1`), causing active downstream tickets (such as `In Dev`) to falsely trigger scope approval, resetting state back to `Ready to Dev`.
- **Warnings:** Scope breaker reset fails to unblock the ticket or remove `[scope-unresolved]` in ADO; `revisedBy` actor is never extracted from ADO by `getWorkItemDetails`; watchdog ignores tickets in `'rejected'` status; and non-atomic dual state updates in the auditor worker risk inconsistent state on ADO network failure.

---

## Critical Issues

### CR-01: Scope Breaker Reset leaves stale `requestedAt` timestamp, triggering immediate Watchdog re-escalation

**File:** `src/scope/gate.ts:65-76`  
**Issue:** When `resetScopeBreaker(workItemId)` is invoked (via comment `[reset-scope]`), it resets `iterationCount = 0`, `escalatedAt = null`, and `status = 'pending'`. However, `requestedAt` is retained from the original ticket parking (e.g. 72+ hours earlier), and `remindedAt` is not cleared. On the very next execution of `checkScopeLockTimeouts()` (`src/scope/watchdog.ts:50`), `elapsed = Date.now() - requestedAt` is still `>= 72h`, and `!ticket.scopeLock.escalatedAt` is now `true`. The watchdog immediately escalates the ticket back to `Blocked` with `[scope-unresolved]`, overriding the PM's reset.  
**Fix:**
Reset `requestedAt` to current timestamp and clear `remindedAt` when resetting the breaker:
```typescript
export async function resetScopeBreaker(workItemId: number): Promise<void> {
  const mutate = async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      if (draft.scopeLock) {
        const now = new Date().toISOString();
        draft.scopeLock.iterationCount = 0;
        draft.scopeLock.escalatedAt = null;
        draft.scopeLock.remindedAt = null;
        draft.scopeLock.requestedAt = now;
        if (draft.scopeLock.status === 'blocked' || draft.scopeLock.status === 'rejected') {
          draft.scopeLock.status = 'pending';
        }
        draft.scopeLock.updatedAt = now;
      }
    });
  };

  if (laneContext.getStore()?.workItemId === workItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(workItemId, mutate);
  }
}
```

---

### CR-02: `detectScopeVerdict` triggers false approval when `previousTags` is undefined on already locked tickets

**File:** `src/scope/verdict.ts:27-37`  
**Issue:** `detectScopeVerdict` evaluates approval via:
```typescript
(input.tags?.includes('[scope-locked]') && !input.previousTags?.includes('[scope-locked]'))
```
When `previousTags` is `undefined` (which occurs when `getWorkItemDetails(workItemId, revId - 1)` fails or throws in `src/execute/router.ts:77-79`, or if an event is evaluated without previous tags), optional chaining `input.previousTags?.includes(...)` returns `undefined`. `!undefined` evaluates to `true`. If the ticket already has `[scope-locked]` (for instance, while in `In Dev` or `Dev Done`), `detectScopeVerdict` returns `{ type: 'approve' }`. In `routeWorkItemEvent` (`src/execute/router.ts:95-98`), this immediately halts normal pipeline routing and calls `handleScopeApproval`, resetting `System.State` back to `'Ready to Dev'` and posting duplicate approval comments.  
**Fix:**
Require `previousTags` to be defined before asserting tag addition, and restrict scope verdict checks to Refinement states (`New` or `Ready to Dev`):
```typescript
  // Approval triggers:
  // 1. Explicit token [approve-scope]
  // 2. State transition New -> Ready to Dev
  // 3. Tag [scope-locked] added (only valid if previousTags is known)
  const isRefinementState = input.currentState === 'New' || input.currentState === 'Ready to Dev';
  const tagJustAdded =
    Boolean(input.tags?.includes('[scope-locked]')) &&
    input.previousTags !== undefined &&
    !input.previousTags.includes('[scope-locked]');

  if (
    comment.includes('[approve-scope]') ||
    (input.previousState === 'New' && input.currentState === 'Ready to Dev') ||
    (isRefinementState && tagJustAdded)
  ) {
    return {
      type: 'approve',
      comment: comment || undefined,
      actor: input.revisedBy,
    };
  }
```

---

## Warnings

### WR-01: `resetScopeBreaker` does not unblock ticket or remove `[scope-unresolved]` tag in ADO

**File:** `src/scope/gate.ts:65-84` and `src/execute/router.ts:91-95`  
**Issue:** Escalation comments generated by `buildScopeEscalationPatch` instruct PMs: *"To reset the scope gate after revising requirements, post `[reset-scope]`"*. When the PM replies with `[reset-scope]`, `router.ts` only executes `resetScopeBreaker(workItemId)`, which modifies the local SQLite/memory state in `stateStore`. No patch is sent to ADO: `System.State` remains `'Blocked'`, the `[scope-unresolved]` tag is not removed, `[awaiting-scope-lock]` is not restored, and no confirmation comment is posted. Because `resolveRoutingStep('Blocked')` returns `undefined`, subsequent updates to the ticket are ignored by the router, leaving the work item deadlocked in ADO unless manually fixed.  
**Fix:**
Implement an ADO update when resetting scope to unblock the ticket in ADO:
```typescript
export async function handleScopeReset(
  workItemId: number,
  currentTags?: string
): Promise<void> {
  await resetScopeBreaker(workItemId);

  const tagPatches = buildTagPatch(
    currentTags,
    '[awaiting-scope-lock]',
    '[scope-unresolved]'
  );

  const commentHtml = `<p><strong>[Scope Reset] Scope Review Breaker Reset by PM</strong></p><p>Refinement circuit breaker reset. Work item unblocked and returned to scope review.</p>\n<!-- [automated-agent] -->`;

  await adoClient.updateWorkItem(workItemId, [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'New',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: commentHtml,
    },
  ]);
}
```
Invoke `handleScopeReset` from `routeWorkItemEvent` when `scopeVerdict.type === 'reset_scope'`.

---

### WR-02: `actor` / `revisedBy` is always undefined because `getWorkItemDetails` does not extract it

**File:** `src/execute/router.ts:88` and `src/ado/work-item.ts:120-138`  
**Issue:** `routeWorkItemEvent` passes `revisedBy: (workItem as any).revisedBy` into `detectScopeVerdict`. However, `workItem` is created by `getWorkItemDetails`, which only returns `{ id, rev, title, description, acceptanceCriteria, state, tags, history }`. The property `revisedBy` does not exist on `WorkItemDetails` and is never populated from `fields['System.ChangedBy']` or `workItem.revisedBy`. As a result, `actor` is always `undefined`, causing `handleScopeApproval` to always fallback to `lockedBy: 'pm'` and omitting the author identity from comments.  
**Fix:**
Add `revisedBy?: string;` to `WorkItemDetails` and populate it in `getWorkItemDetails`:
```typescript
export interface WorkItemDetails {
  id: number;
  rev: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  state: string;
  tags?: string;
  history?: string;
  revisedBy?: string;
}

export async function getWorkItemDetails(
  workItemId: number,
  revId?: number
): Promise<WorkItemDetails> {
  const workItem = revId
    ? await adoClient.getRevision(workItemId, revId)
    : await adoClient.getWorkItem(workItemId);
  const fields = workItem.fields || {};
  const changedBy = fields['System.ChangedBy'];
  const revisedBy =
    typeof changedBy === 'object' && changedBy !== null
      ? changedBy.displayName || changedBy.uniqueName
      : typeof changedBy === 'string'
        ? changedBy
        : workItem.revisedBy?.displayName || workItem.revisedBy?.name;

  return {
    id: workItem.id ?? workItemId,
    rev: workItem.rev ?? fields['System.Rev'] ?? 1,
    title: fields['System.Title'] || '',
    description: fields['System.Description'] || '',
    acceptanceCriteria: fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
    state: fields['System.State'] || '',
    tags: fields['System.Tags'] || '',
    history: fields['System.History'] || '',
    revisedBy,
  };
}
```

---

### WR-03: Watchdog ignores tickets in `'rejected'` status, disabling 24h reminders and 72h escalations for scope revisions

**File:** `src/scope/watchdog.ts:22-24`  
**Issue:** In `checkScopeLockTimeouts()`, the discovery loop filters out any ticket where `ticket.scopeLock?.status !== 'pending'`. When a PM rejects scope with comments (`[reject-scope]`), `evaluateScopeBreaker` sets `draft.scopeLock.status = 'rejected'`. While parked in `New` awaiting revision, the ticket has `status = 'rejected'`. As a result, the watchdog skips it entirely; if requirements are not revised, neither the 24h reminder nor the 72h escalation to `Blocked` will ever trigger.  
**Fix:**
Allow watchdog processing for both `'pending'` and `'rejected'` scope locks:
```typescript
for (const ticket of tickets) {
  if (
    ticket.scopeLock?.status !== 'pending' &&
    ticket.scopeLock?.status !== 'rejected'
  ) {
    continue;
  }
```

---

### WR-04: Non-atomic dual `updateTicketState` in `processWorkItemAudit` risks state inconsistency on ADO update failure

**File:** `src/auditor/worker.ts:59-101`  
**Issue:** In `processWorkItemAudit`, Step 4 calls `stateStore.updateTicketState` to record `draft.auditLogs.push(...)`. It then invokes `adoClient.updateWorkItem(workItemId, patchDoc)`. If the ADO update fails (network timeout, rate limit), the function throws and exits without executing Step 5 (`draft.scopeLock = { status: 'pending', ... }`). On subsequent retry or event delivery, `scopeLock` is uninitialized and ADO tags lack `[awaiting-scope-lock]`. This causes the ticket to be re-audited via LLM tokens and appends duplicate audit log records to `draft.auditLogs`.  
**Fix:**
Either initialize `draft.scopeLock` alongside `draft.auditLogs` in Step 4, or record both after ADO patch confirmation.

---

## Info

### IN-01: Unused fields in `ScopePacketData` interface

**File:** `src/scope/packet.ts:9-32`  
**Issue:** `ScopePacketData` defines `workItemId: number`, `title: string`, and `reasons: string[]`. Callers in `src/auditor/worker.ts:77-82` populate all three fields. However, `formatScopeReviewPacketComment` only reads `data.criteriaSummary`. The Definition of Done verification `reasons` and ticket title are omitted from the rendered table and comment.  
**Fix:**
Render `data.reasons` into the collapsible DoD section of the scope review packet to provide PMs with specific audit verification context.

---

### IN-02: Overloaded untyped signature in `buildScopeEscalationPatch`

**File:** `src/scope/gate.ts:116-130`  
**Issue:** `buildScopeEscalationPatch` accepts `iterationCountOrWorkItemId: number, iterationCountOrCurrentTags?: number | string, maybeCurrentTags?: string` and performs runtime `typeof` checks to support both 2-arg and 3-arg calling styles. While backwards-compatible, it lacks clean TypeScript function overloads.  
**Fix:**
Add explicit TypeScript function overload signatures above the implementation.

---

_Reviewed: 2026-09-17T20:50:00Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: standard_  

## CODE REVIEW COMPLETE
