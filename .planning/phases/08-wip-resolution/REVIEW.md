---
phase: 08-wip-resolution
reviewed: 2026-09-19T11:09:03Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/ai/provider.ts
  - src/auditor/evaluator.ts
  - src/auditor/prompt.ts
  - src/auditor/worker.ts
  - src/cli/ado.ts
  - src/execute/worker.ts
  - src/plan/checkpoint.ts
  - src/plan/formatter.ts
  - src/plan/planner.ts
  - src/state/types.ts
  - tests/auditor-fallback.test.ts
  - tests/plan-checkpoint.test.ts
  - tests/planner-fallback.test.ts
  - tests/planner.test.ts
  - tests/provider.test.ts
  - tests/wip-static-guards.test.ts
  - tests/worker.test.ts
findings:
  critical: 0
  high: 0
  medium: 1
  low: 2
  total: 3
status: findings
---

# Phase 8: Code Review Report

**Reviewed:** 2026-09-19T11:09:03Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** findings

## Summary

Phase 8 completes the uncommitted WIP under phase discipline: `rewriteRouterBody` extraction with explicit failure logging (no silent `catch {}`), evaluator/planner `fallbackUsed`+actual-model returns, planner park-on-LLM-failure, L1/L2 evidence persistence of those fields, removal of the hardcoded `model:'gpt-4o'` audit-log literal, and the opencode plan-skip governance record (`planDelegated`/`planNote` surfaced through the sanitized locked-comment formatter).

Assessment: the phase is solid and meets its stated governance/fallback goals. §Done-well invariants are protected — auditor XML isolation (`escapeXml` + `<user_ticket_input>`) is untouched, the new `governanceNote` rides through `marked.parse` + `sanitizeHtml` (hostile-note test asserts `onerror` stripped) with the `[automated-agent]` loop-shield marker intact, and the empty-catch ban is enforced by a static guard. Full suite verified green (488/488) with `tsc --noEmit` clean. New tests assert real deterministic-rubric logic and model-extraction behavior, not mock echoes.

Three non-blocking findings: one type-safety weakening (`plan: any`) that masks a contract gap, one evidence-semantics nuance on fallback model attribution, and one test-coverage brittleness on the skip branch. None are runtime bugs or security regressions.

Out-of-scope by design: `src/cli/ado.ts` was reviewed but committed "as-is"; its known issues (WIQL interpolation, v1 state vocabulary, unwired/dead code) are explicitly deferred to Phase 12 QAL-03 per the recorded decision — not counted as Phase 8 findings. Prompt XML isolation for the planner (H1), built-in-path deletion (H5), timeouts (M2), and comment sanitization (H3) belong to Phases 9-11 and were not evaluated.

## Medium

### MD-01: `plan: any` erases the PlannerOutcome contract and hides a required-field gap

**File:** `src/execute/worker.ts:404`
**Issue:** `let plan: any` discards the `PlannerOutcome` return type of `formulateImplementationPlan`. The `any` was needed precisely because the opencode-delegated literal (`:406-414`) omits `fallbackUsed` and `model`, which `PlannerOutcome` declares as required (`PlanResult & { fallbackUsed: boolean; model: string }`). Downstream `plan.fallbackUsed` / `plan.model` (`:432-433`, `:457-458`) therefore read `undefined` on the delegated path with no compiler complaint. Runtime is safe today (`createPlanCheckpoint` does `data.model ?? null` and `planDelegated:true` carries the governance signal), but a future reader who assumes `plan.model: string` gets a silent `undefined`, and the type system no longer guards either branch shape.
**Fix:** Type the variable as the union of both branch shapes and make the delegated literal a complete record, so the compiler enforces both:
```ts
type ExecPlan = PlannerOutcome & { planDelegated?: boolean; planNote?: string };
let plan: ExecPlan;
if (env.LOCAL_AGENT_TYPE === 'opencode' && env.NODE_ENV !== 'test' && !options?.forceAiPlanner) {
  plan = {
    hasAmbiguities: false, questions: [],
    planMarkdown: 'Autonomous execution delegated directly to OpenCode agent.',
    estimatedFiles: [], testStrategy: 'Local automated tests',
    fallbackUsed: false, model: 'opencode-delegated',
    planDelegated: true, planNote: 'plan delegated to opencode',
  };
} else {
  plan = await formulateImplementationPlan({ /* ... */ });
}
```

## Low

### LO-01: Fallback records the intended model, not the model that produced the result

**File:** `src/auditor/evaluator.ts:173` (also `:151`; `src/plan/planner.ts:106`, `:42`, `:55`)
**Issue:** On LLM-failure fallback the result is produced by `evaluateDoDDeterministically` (a keyword rubric), yet `model: env.API_MODEL` is recorded. An auditor reading the evidence sees e.g. `model:'gpt-4o', fallbackUsed:true` and could misread `gpt-4o` as the producer of the output. The `fallbackUsed:true` flag mitigates this and the audit's "no hardcoded gpt-4o literal" goal is met, but the `model` value is semantically "attempted model," not "producing model."
**Fix:** On fallback paths record an explicit non-LLM producer so the field is unambiguous, e.g. `model: 'deterministic-rubric'` (keep `fallbackUsed:true`). Success paths already correctly use `result.response?.modelId`. Low priority — informational accuracy only.

### LO-02: Skip-branch governance record is verified only by static source-scan, not by execution

**File:** `tests/wip-static-guards.test.ts:16-27`
**Issue:** SC#4's runtime behavior — the opencode skip branch constructing `planDelegated:true`/`planNote` and flowing them through `createPlanCheckpoint` — is asserted only by `expect(src).toContain(...)` / a regex over `worker.ts` source text. The branch requires `NODE_ENV !== 'test'`, so the worker integration path never executes it under the test runner. `plan-checkpoint.test.ts` covers persistence of those fields and `planner.test.ts` covers note rendering, but no test drives the worker's decision to enter the skip branch and emit the record. The static guard is a pragmatic choice given the env gate, but it is brittle: it passes on string presence regardless of wiring correctness.
**Fix:** Optional — add a worker-level test that stubs `env.LOCAL_AGENT_TYPE='opencode'` and forces the non-test branch (or inject `forceAiPlanner:false` with a spy on `createPlanCheckpoint`) to assert `planDelegated:true` + `planNote` are actually passed. Acceptable to defer given the NODE_ENV gate makes this awkward; keep the static guard as the floor.

---

_Reviewed: 2026-09-19T11:09:03Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
