---
phase: 02-taxonomy-foundation
reviewed: 2026-09-17T19:05:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/pipeline/taxonomy.ts
  - src/execute/router.ts
  - tests/taxonomy.test.ts
  - tests/lifecycle-replay.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-17T19:05:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Standard review conducted on Phase 02 (Taxonomy Foundation) changes covering the Golden Path v2 taxonomy data model (`src/pipeline/taxonomy.ts`), taxonomy-driven state router (`src/execute/router.ts`), taxonomy unit tests (`tests/taxonomy.test.ts`), and full lifecycle replay parity suite (`tests/lifecycle-replay.test.ts`).

Architecture alignment and runtime test execution are strong: all 38 test suites (324 tests) pass, immutability is enforced via `Object.freeze`, and router execution is protected against off-lane state store mutations via `workItemQueueManager.runInLane`.

Two warnings were identified:
1. `src/pipeline/taxonomy.ts:34` fails `tsc --noEmit` build verification due to TypeScript type widening (`evidenceLevels: Object.freeze(['L1'])` infers `readonly string[]` instead of `readonly EvidenceLevel[]`).
2. `resolveRoutingStep` in `src/pipeline/taxonomy.ts:158` uses `tags.includes('[awaiting-input]')`, which behaves inconsistently between strings (substring match) and string arrays (strict equality match), dropping tags if elements contain compound strings or whitespace.

## Warnings

### WR-01: TypeScript Type Mismatch in GOLDEN_PATH_V2 StepDefinition Array

**File:** `src/pipeline/taxonomy.ts:34-152`
**Issue:** Running `npx tsc --noEmit` produces compile error `TS2322`: `Type 'readonly string[]' is not assignable to type 'readonly EvidenceLevel[]'`. In TypeScript, `Object.freeze(['L1'])` without `as const` or explicit generic parameter infers the literal array elements as widened `string[]`. Because `StepDefinition.evidenceLevels` is typed as `readonly EvidenceLevel[]`, assignment fails type check during clean builds.

**Fix:**
Add `as const` to each frozen evidence array (and key tags) across steps 1 through 9:
```typescript
  Object.freeze({
    step: 1,
    name: 'Ticket & AC verify',
    column: 'REFINEMENT',
    actor: 'AI',
    actorDetail: 'AI Agent',
    evidenceLevels: Object.freeze(['L1'] as const),
    primaryEvidenceLevel: 'L1',
    adoState: 'New',
    gateType: 'automated_trigger',
    keyTags: Object.freeze(['[audit-passed]', '[awaiting-scope-lock]'] as const),
    description: 'Audit ticket acceptance criteria and determine readiness to dev',
  }),
```

---

### WR-02: Strict Equality Tag Matching in resolveRoutingStep Drops Array Tags

**File:** `src/pipeline/taxonomy.ts:158`
**Issue:** The `tags` parameter in `resolveRoutingStep` accepts `readonly string[] | string[] | string | null`. Line 158 executes:
```typescript
if (tags && tags.includes('[awaiting-input]'))
```
When `tags` is a `string` (e.g. `'backend; [awaiting-input]'`), `String.prototype.includes` does substring search and correctly matches. However, when `tags` is passed as an array (e.g. `['backend; [awaiting-input]']` or `['backend', ' [awaiting-input]']`), `Array.prototype.includes` evaluates element equality (`item === '[awaiting-input]'`) and returns `false`, causing state routing to miss the awaiting input trigger.

**Fix:**
Normalize array and string checking so both perform substring checks:
```typescript
export function resolveRoutingStep(
  state: string,
  tags?: readonly string[] | string[] | string | null
): StepDefinition | undefined {
  const hasAwaitingInput = typeof tags === 'string'
    ? tags.includes('[awaiting-input]')
    : Array.isArray(tags)
      ? tags.some((t) => typeof t === 'string' && t.includes('[awaiting-input]'))
      : false;

  if (hasAwaitingInput) {
    return getStepByNumber(3);
  }
```

## Info

### IN-01: Steps 5 and 8 Unreachable in resolveRoutingStep

**File:** `src/pipeline/taxonomy.ts:168-174`
**Issue:** `resolveRoutingStep` maps `'Dev Done'` exclusively to Step 4 (`Dev validate & PR`) and `'Ready to Deploy'` exclusively to Step 7 (`Release approval + deploy`). Step 5 (`PR review & CI deploy`, state `'Dev Done'`) and Step 8 (`Smoke test & monitor`, state `'Ready to Deploy'`) in `GOLDEN_PATH_V2` cannot currently be resolved through `resolveRoutingStep`. This preserves exact v1.0 routing parity today, but future phases should incorporate tag checks (e.g. `[pr-merged]` for Step 5, smoke test flags for Step 8) to distinguish multi-step states.
**Fix:** Document step routing precedence or plan tag-based discrimination in future phases (e.g., Phase 3 PM Scope Lock, Phase 5 Smoke Testing).

---

### IN-02: Repeated Array Search in resolveRoutingStep

**File:** `src/pipeline/taxonomy.ts:159,164,166,168,170,172,174,176`
**Issue:** `resolveRoutingStep` repeats `GOLDEN_PATH_V2.find((s) => s.step === X)` on each switch branch rather than using the existing exported lookup helper `getStepByNumber(X)`.
**Fix:** Replace redundant inline `.find((s) => s.step === X)` calls with `getStepByNumber(X)`.

---

_Reviewed: 2026-09-17T19:05:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
