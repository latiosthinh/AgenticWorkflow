---
phase: 03-pm-scope-lock-gate
fixed_at: 2026-09-17T21:01:00Z
review_path: .planning/phases/03-pm-scope-lock-gate/03-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-09-17T21:01:00Z  
**Source review:** .planning/phases/03-pm-scope-lock-gate/03-REVIEW.md  
**Iteration:** 1  

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Scope Breaker Reset leaves stale requestedAt timestamp, triggering immediate Watchdog re-escalation

**Files modified:** `src/scope/gate.ts`, `tests/scope-gate.test.ts`  
**Commit:** 90fb334  
**Applied fix:** In `resetScopeBreaker`, reset `requestedAt` to `new Date().toISOString()`, clear `remindedAt` and `escalatedAt`, and set `status = 'pending'`, preventing immediate 72h timeout re-escalation by the watchdog.

### CR-02: detectScopeVerdict triggers false approval when previousTags is undefined on already locked tickets

**Files modified:** `src/scope/verdict.ts`, `tests/scope-gate.test.ts`  
**Commit:** 79061f3  
**Applied fix:** In `detectScopeVerdict`, required `previousTags !== undefined` and checked that ticket is in refinement state (`currentState === 'New'` or `[awaiting-scope-lock]` tag present) before treating `[scope-locked]` tag addition as approval, preventing in-flight tickets from regressing to `Ready to Dev`.

### WR-01: resetScopeBreaker does not unblock ticket or remove [scope-unresolved] tag in ADO

**Files modified:** `src/scope/gate.ts`, `src/ado/work-item.ts`, `src/execute/router.ts`, `tests/scope-gate.test.ts`  
**Commit:** 85b90ac  
**Applied fix:** Implemented `buildScopeResetPatch` and `handleScopeReset` to update ADO ticket state to `New`, remove `[scope-unresolved]`, restore `[awaiting-scope-lock]`, post a confirmation history comment, and wired it to `routeWorkItemEvent` when verdict is `reset_scope`.

### WR-02: actor / revisedBy is always undefined because getWorkItemDetails does not extract it

**Files modified:** `src/ado/work-item.ts`, `src/execute/router.ts`, `tests/ado-client.test.ts`  
**Commit:** 099d1a7  
**Applied fix:** Added `revisedBy?: string` to `WorkItemDetails` and extracted the modifier identity from `workItem.revisedBy` (displayName/name/uniqueName) or `System.ChangedBy` in `getWorkItemDetails`.

### WR-03: Watchdog ignores tickets in 'rejected' status, disabling 24h reminders and 72h escalations for scope revisions

**Files modified:** `src/scope/watchdog.ts`, `tests/scope-gate.test.ts`  
**Commit:** e96c14e  
**Applied fix:** Updated `checkScopeLockTimeouts` loop to process tickets in both `'pending'` and `'rejected'` status for 24h reminders, 72h escalations to `Blocked`, and live ADO reconciliation to `locked`.

### WR-04: Non-atomic dual updateTicketState in processWorkItemAudit risks state inconsistency on ADO update failure

**Files modified:** `src/auditor/worker.ts`, `tests/scope-gate.test.ts`  
**Commit:** 9a5cca7  
**Applied fix:** Consolidated `stateStore.updateTicketState` to execute atomically after the ADO patch call succeeds, recording both `auditLogs` and `scopeLock` simultaneously, preventing partial state in StateStore on ADO failures.

---

_Fixed: 2026-09-17T21:01:00Z_  
_Fixer: the agent (gsd-code-fixer)_  
_Iteration: 1_
