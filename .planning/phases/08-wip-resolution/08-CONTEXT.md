# Phase 8: WIP Resolution - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the dirty working tree under phase discipline: the uncommitted diff (provider 9router body-rewrite, evaluator/planner LLM fallbacks, opencode plan-skip) plus untracked `src/cli/ado.ts` gets tests, governance-safe fallback behavior, and commits — ending with `git status` clean and the full suite green. No other audit findings are fixed here (SEC/CORE/REL/CFG/QAL/E2E belong to Phases 9–13).

Requirements: WIP-01..05 (`.planning/REQUIREMENTS.md`); findings L9, M7 (`.planning/research/AUDIT-v2.1.md`).

</domain>

<decisions>
## Implementation Decisions

### Fallback & Provider Mechanics
- Provider rewrite: extract exported pure helper `rewriteRouterBody(body)` from `customStreamFetch` in `src/ai/provider.ts`; unit-test success + failure branches; failure branch logs explicitly — no silent `catch {}`.
- Planner fallback (LLM failure): return `hasAmbiguities: true` with question "LLM planning unavailable — human plan review required" → existing `createPlanCheckpoint` path handles park / 24h ping / 72h Blocked. No new states or tags. Boilerplate auto-proceed plan removed.
- Evaluator fallback: deterministic DoD rubric may auto-proceed (risk contained by downstream human PM scope-lock gate, Step 2), but must record `fallbackUsed: true` in persisted evidence.
- Model identity in evidence: actual model from `result.response.model` when available, resolved `env.API_MODEL` as fallback; remove hardcoded `model: 'gpt-4o'` strings (`src/auditor/worker.ts:84,116`).

### WIP Commit Scope
- `src/cli/ado.ts`: commit as-is (untracked → tracked) so the tree is clean; explicit wire-or-delete decision is recorded here and executed in Phase 12 under QAL-03. Do NOT fix its v1 vocabulary/WIQL interpolation in this phase.
- Opencode plan-skip: keep the skip (`LOCAL_AGENT_TYPE=opencode` + non-test + not `forceAiPlanner`); planner call omitted to save tokens since opencode plans autonomously.
- L2 delegation record: additive `planDelegated: true` + `planNote` ("plan delegated to opencode") fields on plan/L2 evidence in `TicketState` (same additive pattern as `l7`); surfaced on the work item as auditable governance deviation.

### Agent's Discretion
- Test file placement/naming per existing conventions (`tests/provider.test.ts` exists — extend it; planner/evaluator fallback tests extend `tests/planner.test.ts`/`tests/auditor.test.ts` or new files as fits).
- Exact `TicketState` type extension mechanics (optional fields, backwards-compatible with existing state files).
- Commit granularity within the phase (GSD atomic-commit conventions apply).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/provider.ts` — `customStreamFetch` (body-rewrite lives here), `getModel()` (9router prefix strip), `appModel` export.
- `src/plan/checkpoint.ts` — `createPlanCheckpoint` already implements park + `[awaiting-input]` tag + 24h ping + 72h Blocked (via `src/plan/watchdog.ts`); planner fallback just feeds it `hasAmbiguities: true`.
- `src/state/types.ts` — `TicketState` additive-field pattern (see `l7Evidence`).
- `escapeXml` (`src/auditor/prompt.ts:7`) — NOT used here (prompt isolation is Phase 9/SEC-01); don't pre-empt.

### Established Patterns
- Tests: Vitest, real fs via `src/state/test-harness.ts` mkdtemp dirs; `vi.mock` rare (4/48 files); `NODE_ENV=test` deterministic branches exist in evaluator/planner.
- Evidence persistence: workers write via `stateStore.updateTicketState` inside `workItemQueueManager.runInLane` — new fields follow the same lane discipline.
- Audit record: `src/auditor/worker.ts` persists audit outcome incl. `model` string.

### Integration Points
- `src/execute/worker.ts:400-423` (uncommitted) — plan-skip branch; L2 delegation record must persist where the plan result is consumed (near `createPlanCheckpoint`/plan persistence path).
- `src/auditor/evaluator.ts` + `src/auditor/worker.ts` — fallback flag flows evaluator → worker → persisted audit record.
- `src/plan/planner.ts` — fallback shape change; callers: `src/execute/worker.ts`, `src/execute/rework-worker.ts` (verify both handle `hasAmbiguities:true` from fallback → checkpoint).

</code_context>

<specifics>
## Specific Ideas

- Keep the 9router behavior exactly: `stream:false` default injection + `9router/` prefix strip in both body rewrite and `getModel()`; the custom endpoint (env `API_ENDPOINT`) depends on it.
- `forceAiPlanner` option stays as the escape hatch to force the real planner under opencode.
- Full suite (existing 462 tests) must stay green — §Done-well invariants per AUDIT-v2.1.md are protected.

</specifics>

<deferred>
## Deferred Ideas

- `src/cli/ado.ts` wire-or-delete + v1 vocabulary fix → Phase 12 (QAL-03).
- Prompt XML isolation for planner/opencode prompts → Phase 9 (SEC-01).
- Recording fallback usage for OTHER LLM call sites (retro/learn) → note for Phase 10+ if touched there.

</deferred>
