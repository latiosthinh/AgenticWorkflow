---
phase: 07-docs-realignment-e2e-proof
reviewed: 2026-09-18T08:45:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - .planning/phases/07-docs-realignment-e2e-proof/07-01-SUMMARY.md
  - tests/state-matrix-sync.test.ts
  - tests/e2e-v2-golden-path.test.ts
  - CLAUDE.md
  - .planning/PROJECT.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - src/deploy/evidence-index.ts
  - .planning/STATE.md
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-09-18T08:45:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed Phase 07 (Docs Realignment & E2E Proof) source and planning artifacts. System successfully aligns documentation to file-backed `StateStore`, removes stale SQLite/Drizzle references, implements 9-step E2E simulation, and adds automated state matrix drift guard. All 46 test suites (436 tests) pass green.

No Critical vulnerabilities or data corruption risks found. Identified 2 Warnings (O(N) archive directory scan fallback in evidence compiler; fragile markdown table parser in drift test) and 2 Info items (bypassed router call in E2E deploy step; redundant test revision mutation).

## Warnings

### WR-01: O(N) full store sweep on archived ticket lookup in `compileL1L7EvidenceIndex`

**File:** `src/deploy/evidence-index.ts:78-84`
**Issue:** When `stateStore.getTicketState(workItemId)` returns null (which occurs whenever a ticket is archived, as `getTicketState` checks only `data/state/tickets/`), fallback logic calls `stateStore.listTickets({ includeArchived: true })`. `listTickets` performs `readdirSync` and reads/parses frontmatter of every ticket in both `tickets/` and `archive/`. For an orchestrator with thousands of archived tickets, post-Done inspection or querying a non-existent ticket triggers unnecessary full-archive disk I/O and JSON parsing.
**Fix:** Add targeted lookup method on `StateStore` (or support `{ includeArchived?: boolean }` in `getTicketState`) to directly resolve `${archiveDir}/${workItemId}.md` rather than parsing all files via `listTickets`:
```typescript
let ticket = await stateStore.getTicketState(workItemId);
let isArchived = false;
if (!ticket) {
  ticket = await stateStore.getArchivedTicketState?.(workItemId) ?? null;
  if (ticket) isArchived = true;
}
```

### WR-02: Markdown table parser in drift guard is fragile to empty cells and subsequent headings

**File:** `tests/state-matrix-sync.test.ts:16-35`
**Issue:**
1. `content.slice(headerIdx)` slices to end-of-file. If a subsequent section in `ROADMAP.md` contains table rows matching `| 1. REFINEMENT`, `tableLines` length assertion fails unexpectedly.
2. `line.split('|').map(c => c.trim()).filter(Boolean)` drops empty cells. If any row in the markdown table ever contains an empty cell (e.g. empty keyTags), column alignment shifts and causes off-by-one errors across index assertions `cells[0..5]`.
**Fix:** Bound section slice at next markdown header `\n## `, and strip only leading/trailing empty cells:
```typescript
const nextHeaderIdx = content.indexOf('\n## ', headerIdx + matrixHeader.length);
const section = nextHeaderIdx === -1 ? content.slice(headerIdx) : content.slice(headerIdx, nextHeaderIdx);
// ...
const rawCells = line.split('|').map((c) => c.trim());
const cells = rawCells.slice(1, rawCells.length - 1);
```

## Info

### IN-01: Direct deploy workflow invocation in E2E simulation bypasses router

**File:** `tests/e2e-v2-golden-path.test.ts:381`
**Issue:** Steps 1 through 6 route through `routeWorkItemEvent`, testing router dispatch. For Step 7, test calls `processDeploymentPreparation` directly, and for Steps 8-9, test calls `processDeploymentWorkflow` directly instead of `routeWorkItemEvent(workItemId, 8, deployOptions)`. While `case 7` in `src/execute/router.ts` executes `processDeploymentWorkflow`, calling the worker directly skips testing router dedup status update for rev 8. Fixture `revisions[9]` is also left unused.
**Fix:** Route Step 8 through `routeWorkItemEvent(workItemId, 8, deployOptions)` to complete router integration coverage for final release steps.

### IN-02: Redundant in-place mutation of `revisions[5]` in E2E test

**File:** `tests/e2e-v2-golden-path.test.ts:303-304`
**Issue:** Test mutates `revisions[5]` to `Ready for QA` right before setting `currentRev = 6`. However, `revisions[6]` is already defined with those exact field values in the test fixture map.
**Fix:** Remove mutation of `revisions[5]` or add comment explaining that it simulates ADO revision history after PR merge.

---

_Reviewed: 2026-09-18T08:45:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

## CODE REVIEW COMPLETE
