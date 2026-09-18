---
phase: 04-l7-evidence-index-extension
plan: 02
subsystem: deploy
tags:
  - evidence-index
  - taxonomy
  - golden-path-v2
  - fail-closed
  - cutover-tolerance
requires:
  - 04-01
provides:
  - EVID-02
  - EVID-03
key-files:
  created: []
  modified:
    - src/deploy/evidence-index.ts
    - tests/deploy-orchestrator.test.ts
    - tests/deploy-evidence-index.test.ts
decisions:
  - Dynamically derive stage columns for L1-L7 table rows from GOLDEN_PATH_V2 columns
  - Permit pending retro status with [PENDING — retro in progress] when failClosed is false
  - Enforce strict fail-closed MissingEvidenceError across L1-L7 when failClosed is true
  - Reject fallback operators (??, ||) in L7 evidence mapping verified via static grep test
metrics:
  duration: 4m
  completed_date: "2026-09-18"
---

# Phase 4 Plan 02: Taxonomy Formatting & Fail-Closed Gates Summary

Taxonomy-driven HTML comment formatting for Unified L1–L7 Evidence Index with cutover tolerance, fail-closed compiler enforcement, and zero-fabrication grep test verification.

## Key Changes

1. **Taxonomy-Driven Formatting (`src/deploy/evidence-index.ts`)**:
   - Implemented `getTaxonomyStage(level: EvidenceLevel)` deriving column names directly from `GOLDEN_PATH_V2`.
   - Updated `formatEvidenceIndexComment` header to `🎉 [Golden Path Complete] Unified L1–L7 Evidence Index`.
   - Updated descriptive copy to reference nine steps across five columns and all seven levels.
   - Formatted L7 row with cutover tolerance badge (`[PENDING — retro in progress]`) when `l7` details are omitted or null, and green `[RECORDED]` badge with takeaways and PR links when present.
   - Allowed anchor tags with `href` in sanitize-html configuration to support runbook and skill PR links.
   - Maintained `<!-- [automated-agent] -->` echo shield at the end of the sanitized comment.

2. **Integration Alignment (`tests/deploy-orchestrator.test.ts`)**:
   - Aligned orchestrator tests to assert Unified L1–L7 Evidence Index header and presence of L7 evidence row.

3. **Fail-Closed & Grep Assertion Test Suite (`tests/deploy-evidence-index.test.ts`)**:
   - Added comprehensive fail-closed test cases ensuring `compileL1L7EvidenceIndex` throws `MissingEvidenceError` with corresponding level when ticket is missing L1, L3, L5, L6, or L7 evidence, or when L7 takeaways are empty.
   - Added cutover tolerance test verifying that when `failClosed` is false or omitted, missing L7 produces `l7: null` and renders `[PENDING — retro in progress]`.
   - Added recompilation freshness test verifying that adding an L7 retro record updates `ticket.evidenceIndex.l7Summary` cleanly from null to fresh JSON.
   - Added static grep assertion test confirming zero fallback operators (`??`, `||`) exist in L7 property mapping.

## Verification

- `npx vitest run tests/deploy-evidence-index.test.ts tests/deploy-orchestrator.test.ts`: Passed (19 tests).
- `npm test`: Passed (40 test files, 371 tests).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - full dynamic taxonomy derivation and test coverage implemented without mock placeholders.

## Self-Check: PASSED

- All files exist: `src/deploy/evidence-index.ts`, `tests/deploy-orchestrator.test.ts`, `tests/deploy-evidence-index.test.ts`.
- Commits exist: `6bd66ea`, `eafbd27`, `2820719`.
