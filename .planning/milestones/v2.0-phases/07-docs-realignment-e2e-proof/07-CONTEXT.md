# Phase 7: Docs Realignment & E2E Proof - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous execution)

<domain>
## Phase Boundary

System and docs provably reflect the BUILT v2 model — router dispatch and evidence labels are taxonomy-driven, docs/state-matrix describe the built file-backed system (not the intended one), and one fixture ticket walks `New → Done → L1–L7` end-to-end on the `StateStore`.

</domain>

<decisions>
## Implementation Decisions

### Final Alignment & E2E Proof
- **End-to-End Walkthrough:** Comprehensive test in `tests/e2e-v2-golden-path.test.ts` driving a fixture ticket through all 9 steps:
  1. `New` (L1 audit pass) -> parks on `New` + `[awaiting-scope-lock]`.
  2. PM scope-lock approval -> transitions to `Ready to Dev` with `[scope-locked]`.
  3. `In Dev` -> agent planning & implementation (L2, L3).
  4. `Dev Done` -> human acceptance approval.
  5. PR review & merge -> `Ready for QA`.
  6. QA staging verification -> `Ready to Deploy`.
  7. Release approval (L5 Environment approval).
  8. Smoke suite & telemetry observation (L6).
  9. Retro awaited & PR published (L7).
  10. Final `Done` transition with full L1–L7 evidence index attached.
- **State Matrix Drift Guard:** Unit test asserting that the Authoritative ADO State Matrix in `ROADMAP.md` strictly aligns with `GOLDEN_PATH_V2` in `src/pipeline/taxonomy.ts` (matching state, actor, evidence per step, governance handoffs, and Done criteria).
- **Stale Vocabulary Sweep:** Verify that user-facing comments, `PROJECT.md`, `REQUIREMENTS.md`, and docs have no stale references to "eight stages", "L1–L6", or SQLite/Drizzle.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/pipeline/taxonomy.ts` — `GOLDEN_PATH_V2` taxonomy definition.
- `src/execute/router.ts` — taxonomy-driven router.
- `src/state/` — `StateStore` file-backed storage.
- `src/deploy/evidence-index.ts` — L1–L7 evidence compiler.
- `tests/lifecycle-replay.test.ts` — existing replay test baseline.

### Established Patterns
- Vitest integration tests with mocked ADO client and ephemeral `createTestStateStore`.

### Integration Points
- `tests/e2e-v2-golden-path.test.ts` (NEW): full 9-step E2E simulation.
- `tests/state-matrix-sync.test.ts` (NEW): asserts `ROADMAP.md` state matrix matches `GOLDEN_PATH_V2`.
- Documentation sweeps: `PROJECT.md`, `REQUIREMENTS.md`, `CLAUDE.md`.

</code_context>

<specifics>
## Specific Ideas

- Assert that all 7 evidence levels are populated in the final evidence index.

</specifics>

<deferred>
## Deferred Ideas

- None.

</deferred>
