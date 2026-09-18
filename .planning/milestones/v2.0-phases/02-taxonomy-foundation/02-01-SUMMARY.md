---
phase: 02-taxonomy-foundation
plan: 01
subsystem: pipeline-taxonomy
tags:
  - taxonomy
  - golden-path-v2
  - pipeline
  - immutability
requires: []
provides:
  - canonical-golden-path-taxonomy
  - taxonomy-lookup-helpers
affects:
  - router-dispatch
  - lifecycle-replay
tech-stack:
  added: []
  patterns:
    - frozen-domain-constants
    - zero-dependency-model
key-files:
  created:
    - src/pipeline/taxonomy.ts
    - tests/taxonomy.test.ts
  modified: []
decisions:
  - "Recursively freeze GOLDEN_PATH_V2 array, step definitions, and child tag/evidence collections via Object.freeze"
  - "Support both string and string-array formats for tags in resolveRoutingStep to maintain compatibility with ADO work item models"
metrics:
  duration: 3m
  completed_date: "2026-09-17"
---

# Phase 02 Plan 01: Taxonomy Foundation Summary

Canonical Golden Path v2 taxonomy data model with 9 steps, 5 columns, frozen immutability, and state resolution helpers.

## Overview

Established `src/pipeline/taxonomy.ts` as the single authoritative source of truth for Golden Path v2 pipeline taxonomy. The module has zero runtime dependencies, exports strongly-typed domain interfaces (`ColumnId`, `StepNumber`, `ActorRole`, `EvidenceLevel`, `AdoState`, `StepDefinition`), and provides a deeply frozen `GOLDEN_PATH_V2` array mapping all 9 steps across 5 columns (REFINEMENT, EXECUTION, ACCEPTANCE, RELEASE, RETRO), actor roles (⚡ AI / 👤 Human), evidence levels (L1–L7), and ADO wire states. Built lookup helpers `resolveRoutingStep`, `getStepByNumber`, `getStepsByColumn`, and `getStepsByAdoState`, backed by a 6-test suite in `tests/taxonomy.test.ts`.

## Key Changes

1. **`src/pipeline/taxonomy.ts`**:
   - Defined `ColumnId`, `StepNumber`, `ActorRole`, `EvidenceLevel`, `AdoState`, and `StepDefinition`.
   - Populated and deeply froze `GOLDEN_PATH_V2` covering Steps 1 through 9.
   - Added resolution helper `resolveRoutingStep` mapping ADO states and `[awaiting-input]` tag to the appropriate step.
   - Added query helpers `getStepByNumber`, `getStepsByColumn`, and `getStepsByAdoState`.
   - Added ponytail extension comment for schema loading in v2.x.

2. **`tests/taxonomy.test.ts`**:
   - Verified 9 steps, 5 columns, and full L1–L7 evidence level coverage.
   - Verified deep immutability (`Object.isFrozen`) on array and all child descriptors.
   - Verified actor roles and detail strings for every step.
   - Verified resolution mapping for ADO states and tags (`[awaiting-input]`).
   - Verified column and state query helpers.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- Created files exist:
  - `src/pipeline/taxonomy.ts`
  - `tests/taxonomy.test.ts`
- Commits exist:
  - `21304a3`: feat(02-01): define Golden Path v2 taxonomy types, constants, and lookup helpers
  - `b14ef85`: test(02-01): implement taxonomy unit tests verifying structure, immutability, and resolution mappings
- Test suite: 37 test files passed (318 tests total).
