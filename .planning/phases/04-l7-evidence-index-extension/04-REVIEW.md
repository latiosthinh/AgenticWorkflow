---
phase: 04-l7-evidence-index-extension
reviewed: 2026-09-18T06:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/state/types.ts
  - src/deploy/evidence-index.ts
  - tests/deploy-evidence-index.test.ts
  - tests/deploy-orchestrator.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-09-18T06:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 4 successfully extends the Evidence Index from L1–L6 to L1–L7, incorporating additive state schemas in `src/state/types.ts`, taxonomy-driven dynamic stage column resolution via `GOLDEN_PATH_V2`, single-writer lane persistence, fail-closed compiler error checking with `MissingEvidenceError`, and zero-fabrication guarantees in `src/deploy/evidence-index.ts`. Backward compatibility is preserved for existing callers via a deprecated `compileL1L6EvidenceIndex` alias.

Zero critical security or data-loss vulnerabilities were detected. Three warnings were identified concerning defensive error handling and concurrency isolation:
1. An unhandled `TypeError` risk when accessing `.length` on `l7.actionItems` in `formatEvidenceIndexComment`.
2. A fail-closed bypass window when `l7Record.takeaways` contains whitespace-only strings.
3. Reading `ticket` state outside the `runInLane` queue boundary in `compileL1L7EvidenceIndex`.

Two informational items note a status badge presentation discrepancy and missing default array initialization for `retroRecords` in `store.ts`.

## Warnings

### WR-01: Unchecked property access on `l7.actionItems.length` in `formatEvidenceIndexComment`

**File:** `src/deploy/evidence-index.ts:222`
**Issue:** When formatting L7 details in `formatEvidenceIndexComment`, the code interpolates `${l7.actionItems.length}`. If `l7` details are present but `actionItems` is undefined or null (for instance, in an untyped ticket document or partial retro state), accessing `.length` throws `TypeError: Cannot read properties of undefined (reading 'length')`.
**Fix:**
Use defensive optional chaining and fallback:
```typescript
const l7Details = l7
  ? `Takeaways: ${sanitizeHtml(l7.takeaways)} | Action items: <code>${Array.isArray(l7.actionItems) ? l7.actionItems.length : 0}</code>${l7.runbookDiffPrUrl ? ` | Runbook: <a href="${sanitizeHtml(l7.runbookDiffPrUrl)}">PR</a>` : ''}${l7.skillPrUrl ? ` | Skill: <a href="${sanitizeHtml(l7.skillPrUrl)}">PR</a>` : ''}`
  : 'Continuous feedback collection pending completion of retrospective step.';
```

---

### WR-02: Whitespace-only string bypasses `failClosed` check for `l7Record.takeaways`

**File:** `src/deploy/evidence-index.ts:111-113`
**Issue:** In `compileL1L7EvidenceIndex`, the fail-closed check tests `if (!l7Record || !l7Record.takeaways)`. If `takeaways` contains whitespace characters only (e.g. `'   '`), it evaluates to truthy in JavaScript, bypassing the fail-closed gate and treating an empty takeaway as recorded evidence.
**Fix:**
Trim `takeaways` when verifying completeness under `failClosed: true`:
```typescript
    if (!l7Record || !l7Record.takeaways || !l7Record.takeaways.trim()) {
      throw new MissingEvidenceError(`Missing required L7 continuous feedback record for #${workItemId}`, 'L7', workItemId);
    }
```

---

### WR-03: `stateStore.getTicketState` read executes outside `runInLane` boundary

**File:** `src/deploy/evidence-index.ts:71,178`
**Issue:** `compileL1L7EvidenceIndex` reads `ticket` state at line 71 without holding the lane lock, but writes `draft.evidenceIndex` at line 178 inside `workItemQueueManager.runInLane`. A concurrent write occurring on the ticket between the read and the write can lead to compilation based on stale data overwriting recent lane mutations. Because `workItemQueueManager.runInLane` supports re-entrancy, the entire compilation routine can safely run within the lane.
**Fix:**
Wrap the entire function body within `workItemQueueManager.runInLane`:
```typescript
export async function compileL1L7EvidenceIndex(
  workItemId: number,
  options?: { failClosed?: boolean }
): Promise<L1L7EvidenceSummary> {
  return workItemQueueManager.runInLane(workItemId, async () => {
    const ticket = await stateStore.getTicketState(workItemId);
    if (!ticket) {
      throw new MissingEvidenceError(`Ticket #${workItemId} not found in state store`, undefined, workItemId);
    }
    // ... extract records and compile summary ...
    await stateStore.updateTicketState(workItemId, (draft) => {
      draft.evidenceIndex = {
        l1Summary: JSON.stringify(summary.l1),
        l2Summary: JSON.stringify(summary.l2),
        l3Summary: JSON.stringify(summary.l3),
        l4Summary: JSON.stringify(summary.l4),
        l5Summary: JSON.stringify(summary.l5),
        l6Summary: JSON.stringify(summary.l6),
        l7Summary: summary.l7 ? JSON.stringify(summary.l7) : null,
        completedAt: new Date().toISOString(),
      };
    });
    return summary;
  });
}
```

## Info

### IN-01: `formatEvidenceIndexComment` badge checks object presence rather than `l7.status`

**File:** `src/deploy/evidence-index.ts:217-219`
**Issue:** `L7SummaryDetails` defines `status: 'RECORDED' | 'VERIFIED' | 'COMPLETED' | 'PENDING'`, but `formatEvidenceIndexComment` chooses between `[RECORDED]` and `[PENDING — retro in progress]` solely based on truthiness of `l7` (`const l7Badge = l7 ? ... : ...`). If an object is supplied with `status: 'PENDING'`, it would render as `[RECORDED]`.
**Fix:**
Check `l7?.status` explicitly when rendering the badge:
```typescript
  const isRecorded = l7 && l7.status !== 'PENDING';
  const l7Badge = isRecorded
    ? '<span style="color: #2e7d32; font-weight: bold;">[RECORDED]</span>'
    : '<span style="color: #f57c00; font-weight: bold;">[PENDING — retro in progress]</span>';
```

---

### IN-02: `TicketState.retroRecords` is optional without default array in `FileStateStore`

**File:** `src/state/types.ts:181`
**Issue:** `retroRecords?: L7EvidenceState[]` is added as optional to `TicketState`. In `src/state/store.ts:221-234`, new tickets initialize all other collection fields as empty arrays (`[]`), but omit `retroRecords`. Producers that perform `draft.retroRecords.push(...)` without defensive initialization (`draft.retroRecords ??= []`) will throw `TypeError: Cannot read properties of undefined (reading 'push')`.
**Fix:**
When writing to `retroRecords` in future phases (e.g. Phase 6), ensure defensive initialization or add `retroRecords: []` to the initial ticket template in `src/state/store.ts`.

---

_Reviewed: 2026-09-18T06:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

## CODE REVIEW COMPLETE
