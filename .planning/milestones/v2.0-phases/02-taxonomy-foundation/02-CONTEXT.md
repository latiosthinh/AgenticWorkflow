# Phase 2: Taxonomy Foundation - Context

**Gathered:** 2026-09-17
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase detected)

<domain>
## Phase Boundary

The Golden Path v2 model (5 columns / 9 steps / actors ⚡👤 / L1–L7) exists as a single data-driven source that drives the state-transition router — with zero behavior change to shipped v1.0 paths, proven by a lifecycle replay parity test.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure/taxonomy phase.
- `src/pipeline/taxonomy.ts` defines `GOLDEN_PATH_V2` as a frozen, type-safe data structure mapping each of the 9 steps to column, step number, name, actor ('AI' | 'Human'), evidence level ('L1'..'L7'), and primary ADO state.
- Zero runtime dependencies for `src/pipeline/taxonomy.ts` (pure TypeScript).
- Router in `src/execute/router.ts` integrates with taxonomy without altering wire contract (ADO states and tags unchanged).
- Replay parity test asserting full `New` -> `Ready to Dev` -> `In Dev` -> `Dev Done` -> `Ready for QA` -> `Ready to Deploy` -> `Done` routing behavior.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/execute/router.ts` — existing `routeWorkItemEvent` router mapping ADO states to handlers.
- `src/state/` — file-backed StateStore foundation from Phase 1.

### Established Patterns
- Fastify webhook routing, ADO work-item state strings as wire contracts.

### Integration Points
- `src/pipeline/taxonomy.ts` created.
- `src/execute/router.ts` refactored to look up step configurations from `src/pipeline/taxonomy.ts`.

</code_context>

<specifics>
## Specific Ideas

No directory renames. Taxonomy is data over existing directories.

</specifics>

<deferred>
## Deferred Ideas

- None.

</deferred>
