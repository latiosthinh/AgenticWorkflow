# Phase 4: L7 Evidence Index Extension - Context

**Gathered:** 2026-09-17
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous execution)

<domain>
## Phase Boundary

The unified evidence record + index extend L1–L6 → **L1–L7** as an additive field on the ticket state file (no schema migration — state is file-backed), with a fail-closed compiler: a missing gating-level record throws; nothing is fabricated.

</domain>

<decisions>
## Implementation Decisions

### L7 Evidence Index Design
- **Single Source of Table Rows:** Evidence table rows generated dynamically from `GOLDEN_PATH_V2` taxonomy in `src/pipeline/taxonomy.ts`, rather than hardcoded HTML table rows.
- **Fail-Closed Gate (EVID-03):** `compileL1L7EvidenceIndex(workItemId, { failClosed: true })` throws `MissingEvidenceError` if required gating evidence is missing. No silent pass, no fabricated defaults for L7 (no `?? 1` or `|| '0.05%'`).
- **Cutover Tolerance:** When not in strict failClosed mode or during intermediate viewing, missing L7 displays `[PENDING — retro in progress]`.
- **Additive State Field:** `l7` summary added to `EvidenceIndexState` and `TicketState.evidenceIndex` in `src/state/types.ts`.
- **Backward Compatibility:** `compileL1L6EvidenceIndex` exported as deprecated alias pointing to `compileL1L7EvidenceIndex`.
- **Comment Copy Update:** Formatted HTML comment reflects "nine steps / five columns / seven levels" in header and summary text.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/pipeline/taxonomy.ts` — `GOLDEN_PATH_V2` taxonomy step and evidence level definitions.
- `src/deploy/evidence-index.ts` — current L1–L6 compiler and formatter.
- `src/state/types.ts` — `TicketState`, `EvidenceIndexState`, `L7EvidenceState`.

### Established Patterns
- Sanitized HTML with `sanitizeHtml` allow-list, `<!-- [automated-agent] -->` echo shield.

### Integration Points
- `src/deploy/evidence-index.ts`: refactor to compile and format L1–L7.
- `src/state/types.ts`: extend `EvidenceIndexState` with `l7Summary`.
- `tests/deploy-evidence-index.test.ts`: verify full L1–L7 index, fail-closed behavior, and zero fabricated defaults.

</code_context>

<specifics>
## Specific Ideas

- Throw explicit `MissingEvidenceError` when fail-closed checks fail.
- Zero fallback operators on L7 fields in test assertions.

</specifics>

<deferred>
## Deferred Ideas

- None.

</deferred>
