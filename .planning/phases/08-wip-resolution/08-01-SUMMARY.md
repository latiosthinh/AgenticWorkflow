---
phase: 08-wip-resolution
plan: 01
subsystem: ai
tags: [vercel-ai-sdk, 9router, fallback-evidence, vitest, vi-mock, governance]

# Dependency graph
requires:
  - phase: 07-deploy (v2.0)
    provides: "Golden Path v2 pipeline; createPlanCheckpoint park/watchdog machinery the planner fallback feeds"
provides:
  - "exported rewriteRouterBody(body) pure helper — stream:false injection + 9router/ prefix strip with console.warn failure branch (no silent catch {})"
  - "PlannerOutcome = PlanResult & { fallbackUsed, model } — LLM failure parks via hasAmbiguities:true 'LLM planning unavailable — human plan review required'"
  - "AuditOutcome = AuditResult & { fallbackUsed, model } on all four evaluator return paths (mock/test-env/success/catch)"
  - "static guard tests: provider no-empty-catch, rework-worker planner-free, worker hasAmbiguities→createPlanCheckpoint routing"
affects: [08-02 (persists fallbackUsed/model into evidence, removes hardcoded model:'gpt-4o'), 10-security-hardening (other LLM call-site fallback recording)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LLM call sites return { ...SchemaParse(result), fallbackUsed, model } — every path stamps provenance"
    - "vi.hoisted + vi.mock('ai', importOriginal) for LLM-path unit tests (generateTextMock)"
    - "static source guards via readFileSync(new URL(...)) + regex/containment assertions"

key-files:
  created:
    - tests/planner-fallback.test.ts
    - tests/auditor-fallback.test.ts
  modified:
    - src/ai/provider.ts
    - tests/provider.test.ts
    - src/plan/planner.ts
    - src/auditor/evaluator.ts

key-decisions:
  - "Actual model read from result.response.modelId (AI SDK v7 LanguageModelResponseMetadata field), not response.model as plan drafted — .model is always undefined in production"
  - "WIP-02 requirement stays open after this plan: producer half (return shapes) landed here; persistence half (auditor/worker.ts) lands in 08-02, which also lists WIP-02"
  - "rewriteRouterBody object-guard forwards valid JSON primitives untouched instead of throwing into catch — same observable outcome, edge-case-correct"

patterns-established:
  - "Fallback provenance stamping: fallbackUsed + resolved/actual model on every LLM-call-site return path"
  - "Park-don't-proceed: LLM planning failure routes into existing human checkpoint machinery instead of fabricating a plan"

requirements-completed: [WIP-01, WIP-03]

# Metrics
duration: 28min
completed: 2026-09-19
---

# Phase 8 Plan 01: WIP Fallback Mechanics Summary

**9router body-rewrite extracted into tested pure helper with explicit failure logging; planner LLM-failure fallback now parks tickets for human review (boilerplate auto-proceed plan deleted); evaluator + planner returns stamp fallbackUsed + actual model on every path.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-09-19T10:06:25Z
- **Completed:** 2026-09-19T10:34:52Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- **WIP-01:** `rewriteRouterBody` exported from `src/ai/provider.ts`, consumed by `customStreamFetch`; the silent `catch {}` is gone — parse failures forward the original body and `console.warn` once (T-08-01 mitigated). Static no-empty-catch guard test enforces permanence.
- **WIP-03:** planner catch branch returns the park shape (`hasAmbiguities:true`, question `'LLM planning unavailable — human plan review required'`, empty plan fields, `fallbackUsed:true`) which the EXISTING `worker.ts` `if (plan.hasAmbiguities)` → `createPlanCheckpoint` branch consumes unchanged (T-08-03 mitigated). Boilerplate "Implement {title} per requirements" auto-proceed plan deleted; `rg "Autonomous execution delegated" src/plan/planner.ts` → 0 matches.
- **WIP-02 (producer half):** `PlannerOutcome`/`AuditOutcome` types carry `fallbackUsed` + `model` (actual `response.modelId` when available, else `env.API_MODEL`; mock path → `'mock'`) on every return path (T-08-02 mechanism ready for 08-02 persistence).
- Test suite: 462 → 483 (21 new: 8 provider, 7 planner-fallback, 6 auditor-fallback). `NODE_ENV=test` deterministic branches unchanged and still LLM-free.

## Task Commits

Each task was committed atomically (TDD RED→GREEN within each task, single commit per plan convention):

1. **Task 1: Extract rewriteRouterBody pure helper + failure logging (WIP-01)** - `4c48f5e` (refactor)
2. **Task 2: Planner LLM-failure fallback parks for human review (WIP-03)** - `5c10a20` (fix)
3. **Task 3: Evaluator returns fallbackUsed + actual model on every path (WIP-02)** - `b5e5367` (feat)

**Plan metadata:** see final docs commit (git log).

## Files Created/Modified

- `src/ai/provider.ts` - added exported `rewriteRouterBody`; `customStreamFetch` consumes it; silent `catch {}` deleted
- `tests/provider.test.ts` - +8 tests: rewrite success/primitive/non-string/failure branches, getModel prefix strip, fetch integration (stubbed global fetch), static no-catch guard
- `src/plan/planner.ts` - `PlannerOutcome` type; all 4 return paths stamp fallbackUsed+model; catch branch parks instead of auto-proceeding
- `tests/planner-fallback.test.ts` (new) - 7 tests: park shape + schema validity + model capture + deterministic branches + static caller guards (rework-worker planner-free; worker routes hasAmbiguities→createPlanCheckpoint)
- `src/auditor/evaluator.ts` - `AuditOutcome` type; mock/test-env/success/catch paths stamp fallbackUsed+model; rubric logic untouched
- `tests/auditor-fallback.test.ts` (new) - 6 tests: fallback stamping on pass+fail fixtures, model capture/fallback, deterministic + mock paths, warn-once on reject only

## Decisions Made

- **`response.modelId`, not `response.model`:** AI SDK v7's `LanguageModelResponseMetadata` exposes `modelId`; the plan-drafted `.model` read compiled to a TS2551 error and would have been permanently `undefined` in production (silent degradation to env.API_MODEL). Fixed in planner + evaluator and in both test mocks.
- **WIP-02 stays unchecked in REQUIREMENTS.md:** 08-02-PLAN.md also lists WIP-02 (persistence half: auditor/worker.ts hardcoded `model:'gpt-4o'` at :84,:116). Marking it complete now would falsely close a requirement with half its mechanism unlanded. Only WIP-01 + WIP-03 marked.
- **One commit per task (not test/feat split):** plan `<done>` blocks define a single atomic commit + staging list per task; followed plan over generic TDD two-commit convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AI SDK v7 response metadata field is `modelId`, plan specified `.model`**
- **Found during:** Task 2 (planner success path) — `npx tsc --noEmit` failed with TS2551 `Property 'model' does not exist on type 'LanguageModelResponseMetadata'. Did you mean 'modelId'?`
- **Issue:** Plan action text used `result.response?.model`; the installed AI SDK exposes `modelId`. Reading `.model` would always be undefined → "actual model" truth silently unachievable.
- **Fix:** Used `result.response?.modelId` in planner (Task 2) and evaluator (Task 3); test mocks resolve `response: { modelId: '...' }`.
- **Files modified:** src/plan/planner.ts, tests/planner-fallback.test.ts, src/auditor/evaluator.ts, tests/auditor-fallback.test.ts
- **Verification:** tsc clean; model-capture tests assert `'router-actual-1'` / `'m-actual'` flow through.
- **Committed in:** 5c10a20, b5e5367 (task commits)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Semantic intent preserved exactly ("actual response model when available"); field name corrected to the real SDK API. No scope creep.

## Issues Encountered

None beyond the deviation above. Baseline verified green (462/462) on the dirty tree before starting; full suite green (483/483) after Task 3.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. All return paths wired; no placeholder data. (Deliberate deferrals owned by other plans: `auditor/worker.ts` persistence + hardcoded `model:'gpt-4o'` → 08-02 Task 1; `execute/worker.ts` opencode plan-skip L2 delegation record → 08-02.)

## Next Phase Readiness

- 08-02 consumes `AuditOutcome`/`PlannerOutcome` (persist `fallbackUsed`/`model` into evidence, remove hardcoded model strings, commit prompt.ts/worker.ts/src/cli/ remainder).
- Remaining dirty files exactly as planned: `src/auditor/prompt.ts`, `src/execute/worker.ts`, untracked `src/cli/`.
- No §Done-well invariant touched (HMAC, wx-dedup, lanes, formatters, store writes, breakers, withRetry all unedited).

## Self-Check: PASSED

- FOUND: src/ai/provider.ts (contains `export function rewriteRouterBody`)
- FOUND: src/plan/planner.ts (contains `LLM planning unavailable`)
- FOUND: src/auditor/evaluator.ts (contains `fallbackUsed`)
- FOUND: tests/provider.test.ts, tests/planner-fallback.test.ts, tests/auditor-fallback.test.ts
- FOUND commits: 4c48f5e, 5c10a20, b5e5367 (git log)

---
*Phase: 08-wip-resolution*
*Completed: 2026-09-19*
