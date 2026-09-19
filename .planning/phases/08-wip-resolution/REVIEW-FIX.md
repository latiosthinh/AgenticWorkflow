---
phase: 08-wip-resolution
fixed_at: 2026-09-19T11:26:46Z
review_path: .planning/phases/08-wip-resolution/REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-09-19T11:26:46Z
**Source review:** .planning/phases/08-wip-resolution/REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (1 Medium, 2 Low)
- Fixed: 3
- Skipped: 0
- Verification: `npx tsc --noEmit` clean; full `npm test` 489/489 green (51 files) — 488 prior + 1 new LO-02 runtime test

## Fixed Issues

### MD-01: `plan: any` erases the PlannerOutcome contract and hides a required-field gap

**Files modified:** `src/execute/worker.ts`
**Commit:** `86ed41a`
**Applied fix:** As suggested. Added `type PlannerOutcome` import; typed the variable `let plan: ExecPlan` where `type ExecPlan = PlannerOutcome & { planDelegated?: boolean; planNote?: string }`; completed the opencode-delegated literal with the previously missing required fields `fallbackUsed: false, model: 'opencode-delegated'`. The compiler now enforces both branch shapes; `plan.fallbackUsed` / `plan.model` can no longer read silent `undefined` on the delegated path. Runtime behavior of the delegated path improves only in the recorded evidence (checkpoint now persists `model:'opencode-delegated'`, `fallbackUsed:false` instead of nulls).

### LO-01: Fallback records the intended model, not the model that produced the result

**Files modified:** `src/auditor/evaluator.ts`, `src/plan/planner.ts`, `tests/auditor-fallback.test.ts`, `tests/planner-fallback.test.ts`
**Commit:** `0ee3de1`
**Applied fix:** Fallback paths (`fallbackUsed:true`) now record the producing engine instead of `env.API_MODEL`: evaluator LLM-failure catch → `model: 'deterministic-rubric'`; planner park-on-failure → `model: 'deterministic-park'` (park record is a deterministic stub, not a rubric evaluation — distinct literal keeps the evidence precise). Three test assertions updated to the new values. Success paths untouched (still `result.response?.modelId || env.API_MODEL`).

**Scope note:** The NODE_ENV=test deterministic stub branches cited in the finding's File line (evaluator `:151`, planner `:42`/`:55`) intentionally keep `model: env.API_MODEL`. They carry `fallbackUsed:false`, are dev-only branches gated behind the test env (not fallback evidence), and the phase test suite pins `API_MODEL` hermetically for them (worker.test.ts Case 1 asserts `'gpt-4o'`). The finding's Fix text scopes the change to "fallback paths" — changing the test-env stubs would rewrite phase-designed hermeticity expectations beyond the finding's intent and the constraint to keep NODE_ENV=test deterministic branches working.

### LO-02: Skip-branch governance record is verified only by static source-scan, not by execution

**Files modified:** `tests/opencode-runner.test.ts`
**Commit:** `a4122ac`
**Applied fix:** Added a runtime worker-level test in the existing "Worker Integration with OpenCode runner" describe (reuses its state harness, worktree/branch cleanup). The test stubs `env.LOCAL_AGENT_TYPE='opencode'` and `env.NODE_ENV='development'` (restored in `finally`), drives the real `processWorkItemExecute` with `mockOpenCodeRunner` + `mockTestRunner`, and asserts:
- persisted checkpoint carries `planDelegated:true` and `planNote:'plan delegated to opencode'` (fields actually passed through `createPlanCheckpoint`);
- `model:'opencode-delegated'` — the skip-branch fingerprint proving the planner LLM was bypassed (MD-01's typed literal makes this value exclusive to the skip branch);
- `fallbackUsed:false`, checkpoint `status:'locked'`;
- the locked ADO history comment surfaces the governance note.

The static guard in `tests/wip-static-guards.test.ts` is kept as the floor, per the finding.

## Skipped Issues

None — all in-scope findings fixed.

## Invariants Preserved

- §Done-well (AUDIT-v2.1.md) untouched: auditor XML isolation, `escapeXml`, `[automated-agent]` loop-shield marker, empty-catch static guard, sanitized governance-note rendering — no edits to `src/auditor/prompt.ts`, `src/ado/*`, or formatter/sanitizer code.
- No new dependencies.
- No Phase 9+ scope pre-empted (planner prompt XML isolation, built-in path, timeouts, comment sanitization all untouched).
- NODE_ENV=test deterministic branches verified working (worker.test.ts, auditor-fallback.test.ts, planner-fallback.test.ts test-env cases green).

---

_Fixed: 2026-09-19T11:26:46Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
