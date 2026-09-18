# Phase 7: Docs Realignment & E2E Proof - Research

**Researched:** 2026-09-18
**Domain:** Documentation synchronization, Golden Path v2 E2E verification, StateStore persistence, taxonomy drift guard
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### the agent's Discretion
- None specified (autonomous execution / auto-accepted recommendations).

### Deferred Ideas (OUT OF SCOPE)
- None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAX-02 | The ADO state-transition router and the evidence-index stage labels are driven by the v2 taxonomy, and the authoritative state matrix in ROADMAP/docs reflects the 5 columns / 9 steps / L1–L7 model with governance hand-offs. | Verified taxonomy definitions in `src/pipeline/taxonomy.ts`, router dispatch in `src/execute/router.ts`, evidence index formatter in `src/deploy/evidence-index.ts`. Verified implementation path for `tests/e2e-v2-golden-path.test.ts` driving all 9 steps and `tests/state-matrix-sync.test.ts` ensuring zero drift with `ROADMAP.md`. Identified copy sweep targets across `PROJECT.md`, `CLAUDE.md`, and `REQUIREMENTS.md`. [VERIFIED: codebase inspection] |
</phase_requirements>

## Summary

Phase 7 completes Milestone v2.0 by providing comprehensive proof that the built system reflects the Golden Path v2 specification (`.idea/v2.md`). Across Phases 1–6, the orchestrator migrated persistence to a file-backed `StateStore`, codified the 5-column / 9-step / L1–L7 taxonomy in `src/pipeline/taxonomy.ts`, implemented the PM scope-lock gate, extended evidence aggregation to L1–L7, introduced the production smoke suite, and wired awaited retrospective generation before the `Done` transition.

The primary objective of Phase 7 is twofold: (1) prove the integrated operation of all 9 steps in a single end-to-end execution simulation (`tests/e2e-v2-golden-path.test.ts`) that verifies step transitions, taxonomy routing, non-null L1–L7 evidence accumulation in the `StateStore`, and ticket archiving; and (2) construct an automated drift guard (`tests/state-matrix-sync.test.ts`) that asserts the Authoritative ADO State Matrix in `ROADMAP.md` strictly mirrors `GOLDEN_PATH_V2` in code. Additionally, documentation (`PROJECT.md`, `CLAUDE.md`, `REQUIREMENTS.md`) must be swept clean of obsolete references to "eight stages", "L1–L6", and SQLite/Drizzle.

**Primary recommendation:** Implement `tests/e2e-v2-golden-path.test.ts` using `createTestStateStore` and mocked ADO APIs to walk a fixture ticket through all 9 steps, create `tests/state-matrix-sync.test.ts` with markdown AST table parsing to prevent documentation drift, and execute the documentation sweep across `PROJECT.md`, `CLAUDE.md`, and `REQUIREMENTS.md` with zero new runtime dependencies.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Golden Path v2 E2E Simulation | Test & Verification (`tests/e2e-v2-golden-path.test.ts`) | Orchestration (`src/execute/router.ts`) | Drives fixture ticket through all 9 steps across lanes and verifies `StateStore` state transitions end-to-end. [VERIFIED: codebase inspection] |
| State Matrix Synchronization Guard | Test & Verification (`tests/state-matrix-sync.test.ts`) | Planning & Governance (`ROADMAP.md`, `taxonomy.ts`) | Ensures published documentation and programmatic data definitions cannot silently drift. [VERIFIED: codebase inspection] |
| Taxonomy Resolution & Step Routing | Core Domain (`src/pipeline/taxonomy.ts`) | Routing (`src/execute/router.ts`) | Encapsulates immutable 5-column / 9-step data structure driving the router dispatch table. [VERIFIED: `src/pipeline/taxonomy.ts`] |
| L1–L7 Evidence Index Compilation | Evidence Tier (`src/deploy/evidence-index.ts`) | Storage (`src/state/`) | Aggregates audit logs, tests, QA, deployments, smoke, and retro records into single non-null evidence summary. [VERIFIED: `src/deploy/evidence-index.ts`] |
| Documentation Synchronization | Documentation Tier (`PROJECT.md`, `CLAUDE.md`, `REQUIREMENTS.md`) | — | Realigns project constraints and developer instructions with the built file-backed v2 system. [VERIFIED: codebase inspection] |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Node.js** | `24.x LTS` (v24.0.2) | Runtime environment | Host platform standard; native fetch, ESM, modern V8. [VERIFIED: host environment] |
| **TypeScript** | `^7.0.2` | Language & types | Complete type safety across taxonomy, evidence models, and state records. [VERIFIED: `package.json`] |
| **Vitest** | `^5.0.0` | Test framework | ESM-native test runner powering all 44 test suites in the repository. [VERIFIED: `package.json`] |
| **node:fs** / **node:path** | built-in | File I/O & parsing | Native file system operations for markdown parsing and state store validation; zero dependency bloat. [VERIFIED: Node.js stdlib] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **sanitize-html** | `^2.17.7` | Comment HTML sanitization | Sanitizes generated evidence index comments and scope packets against XSS. [VERIFIED: `package.json`] |
| **zod** | `^4.5.4` | Schema validation | Validates environment variables, retro payloads, and action items. [VERIFIED: `package.json`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `node:fs` regex table parser | `marked` / `remark` AST parser | Overkill; simple string split and regex parsing over markdown table rows avoids adding AST dependencies or complex visitor boilerplate. [VERIFIED: codebase inspection] |
| In-process E2E test | Live ADO API integration | Live ADO requires active network credentials, organization permissions, and introduces non-deterministic test latency. In-process mocked Wit API with real `StateStore` provides deterministic, millisecond verification. [VERIFIED: `tests/lifecycle-replay.test.ts`] |

## Architecture Patterns

### System Architecture Diagram

```
                 [Step 1: New]
                       │
                       ▼
            processWorkItemAudit()
            - L1 DoD Evaluation (Deterministic / LLM)
            - Persists draft.auditLogs (L1)
            - Sets draft.scopeLock.status = 'pending'
            - Parks in 'New' + [awaiting-scope-lock]
                       │
                       ▼
          [Step 2: Scope Review & Verify]
                       │
          PM verdict: [approve-scope]
          handleScopeApproval()
          - Sets draft.scopeLock.status = 'locked'
          - Transitions to 'Ready to Dev' + [scope-locked]
                       │
                       ▼
          [Step 3: Loop: Plan-Code-Test]
                       │
          routeWorkItemEvent(id, 3)
          - Guard: isScopeLocked() verified
          - Execution worker / test runner
          - Persists draft.l3Evidence (L2, L3)
          - Transitions to 'Dev Done' + [l3-verified]
                       │
                       ▼
          [Step 4: Dev Validate & PR]
                       │
          routeWorkItemEvent(id, 4)
          - Creates PR via createOrGetPullRequest()
          - Human dev verdict: [approve-acceptance]
          - Tags updated to [acceptance-approved]
                       │
                       ▼
          [Step 5: PR Review & CI Deploy]
                       │
          TechLead / SA PR Approval & Merge
          - Work item tagged [pr-merged]
          - Transitions to 'Ready for QA'
                       │
                       ▼
          [Step 6: QA Staging Verify]
                       │
          routeWorkItemEvent(id, 6)
          - Runs QA 2-strike filter
          - Persists draft.qaEvidence (L3, L5)
          - Transitions to 'Ready to Deploy' + [qa-verified]
                       │
                       ▼
    [Step 7 & 8: Release Approval, Smoke & Monitor]
                       │
          routeWorkItemEvent(id, 7/8)
          - Step 7: L5 Environment readiness packet & deploymentRecords
          - Step 8: Production smoke test (checksPassed >= 1) -> draft.smokeEvidence
          - Step 8: Telemetry observation (30m window, breached: false) -> draft.telemetryEvaluations
                       │
                       ▼
    [Step 9 & 10: Retrospective & Final Done Transition]
                       │
          processTelemetryEvaluation()
          - Step 9: Awaited retro feedback loop -> draft.retroRecords & draft.l7Evidence
          - Step 10: compileL1L7EvidenceIndex(id, { failClosed: true })
          - draft.evidenceIndex populated with all 7 non-null summaries
          - Transitions to 'Done' + [golden-path-complete]
          - Attaches full unified L1–L7 evidence index comment
          - Archives ticket to archive/<id>.md
```

### Recommended Project Structure
```
tests/
├── e2e-v2-golden-path.test.ts   # NEW: Full 9-step Golden Path v2 E2E simulation
└── state-matrix-sync.test.ts     # NEW: Validates ROADMAP.md matrix matches GOLDEN_PATH_V2

.planning/
├── PROJECT.md                    # Updated: milestone status, completed goals, clean stack
├── REQUIREMENTS.md               # Updated: TAX-02 marked complete
└── ROADMAP.md                    # Checked: Authoritative ADO State Matrix verified against taxonomy

CLAUDE.md                         # Updated: Remove stale better-sqlite3/drizzle stack entries
```

### Pattern 1: End-to-End Walkthrough on File-Backed StateStore
**What:** Drives a fixture work item through all 9 steps using `routeWorkItemEvent`, testing every state transition, tag update, and `StateStore` section mutation.
**When to use:** In `tests/e2e-v2-golden-path.test.ts` to guarantee that real application code drives the entire Golden Path v2 pipeline.
**Example:**
```typescript
// tests/e2e-v2-golden-path.test.ts
const harness = createTestStateStore();
(env as any).STATE_STORE_DIR = harness.tempDir;
resetStateStore();

// Step 1: New -> Audit pass -> Parked
await routeWorkItemEvent(workItemId, 1);
let ticket = await stateStore.getTicketState(workItemId);
expect(ticket?.auditLogs[0].verdict).toBe('passed');
expect(ticket?.scopeLock?.status).toBe('pending');

// Step 2: PM Scope Approval -> Ready to Dev
await routeWorkItemEvent(workItemId, 2);
ticket = await stateStore.getTicketState(workItemId);
expect(ticket?.scopeLock?.status).toBe('locked');
```

### Pattern 2: Markdown Table AST Extraction for Drift Prevention
**What:** Parses the Markdown table in `ROADMAP.md` and validates every column, step number, name, actor, ADO state, key tags, and evidence levels against `GOLDEN_PATH_V2`.
**When to use:** In `tests/state-matrix-sync.test.ts` to prevent silent documentation-code drift.
**Example:**
```typescript
// tests/state-matrix-sync.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { GOLDEN_PATH_V2 } from '../src/pipeline/taxonomy.js';

const roadmapContent = fs.readFileSync(path.resolve('.planning/ROADMAP.md'), 'utf-8');
const lines = roadmapContent.split('\n');
// Extract table rows under ## Authoritative ADO State Matrix
```

### Anti-Patterns to Avoid
- **Mocking the StateStore:** Never mock `StateStore` in E2E tests. Use `createTestStateStore()` on a temporary directory so real file I/O, frontmatter parsing, and atomic writes are verified.
- **Tolerating Null/Undefined Evidence at Done:** Golden Path v2 requires L1 through L7 to be fully populated. Assert that all 7 levels are non-null.
- **Regex Drift Fragility:** Do not use rigid exact-whitespace regexes when parsing markdown tables; trim cells and normalize tags.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown Table Parsing | External AST parsing library (e.g. unified/remark) | Simple line-based pipe splitting (`line.split('|').map(s => s.trim())`) | Adding external parser packages violates the locked zero-new-dependencies constraint. [VERIFIED: `ROADMAP.md`] |
| Evidence Index Compilation | Custom test-only compiler | `compileL1L7EvidenceIndex` from `src/deploy/evidence-index.ts` | Uses the production fail-closed compiler directly to prove steady-state behavior. [VERIFIED: codebase inspection] |
| Test State Isolation | Custom temp dir cleanup logic | `createTestStateStore()` from `src/state/test-harness.ts` | Established repository fixture pattern with safe `mkdtemp` and `cleanup()`. [VERIFIED: `src/state/test-harness.ts`] |

## Runtime State Inventory

> Required for documentation, rename, and cleanup tasks.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `data/state/tickets/`, `data/state/dedup/`, `data/state/archive/` | Verified: All ticket state files use v2 frontmatter (`auditLogs`, `scopeLock`, `l3Evidence`, `qaEvidence`, `deploymentRecords`, `smokeEvidence`, `telemetryEvaluations`, `retroRecords`, `l7Evidence`, `evidenceIndex`). Zero SQLite database files exist. [VERIFIED: codebase inspection] |
| Live service config | None — orchestrator runs locally/in CI without external database servers. | None. [VERIFIED: codebase inspection] |
| OS-registered state | None — no OS services, Task Scheduler, or PM2 configurations. | None. [VERIFIED: codebase inspection] |
| Secrets/env vars | `CLAUDE.md` has stale `better-sqlite3` and `Drizzle ORM` entries in its embedded stack table. | Update `CLAUDE.md` to reflect the file-backed `StateStore` architecture. [VERIFIED: `CLAUDE.md`] |
| Build artifacts | `package.json` was already cleaned in Phase 1 (zero SQLite packages). | Sweep `PROJECT.md` and `REQUIREMENTS.md` to update status markers and remove stale references to "eight stages" and "L1–L6". [VERIFIED: codebase inspection] |

## Common Pitfalls

### Pitfall 1: Mocking Execution Without Writing L3 Evidence
**What goes wrong:** `tests/e2e-v2-golden-path.test.ts` mocks `processWorkItemExecute` by only updating dedup status without recording `l3Evidence`, causing downstream Step 10 `compileL1L7EvidenceIndex` with `{ failClosed: true }` to throw `MissingEvidenceError`.
**Why it happens:** In `tests/lifecycle-replay.test.ts`, downstream workers were mocked superficially to verify pure routing. An E2E test requires real state accumulation.
**How to avoid:** Ensure Step 3 execution writes a valid `L3EvidenceState` entry to `draft.l3Evidence` (or calls `recordL3Evidence`).
**Warning signs:** `MissingEvidenceError: Missing required L3 test evidence for #9901`.

### Pitfall 2: Markdown Formatting Mismatches in Matrix Sync Test
**What goes wrong:** Markdown tables contain styling elements (e.g. `**L1**`, `` `New` ``, `⚡ AI`, `👤 PM`). If string equality checks don't strip formatting, tests fail on superficial markdown tokens.
**Why it happens:** Markdown tables format text with backticks, bold asterisks, and emojis for human readability.
**How to avoid:** Normalize table cells: strip backticks, strip bold markers `**`, and check for emoji indicators (`⚡` vs `👤`).
**Warning signs:** `AssertionError: expected '**L1**' to equal 'L1'`.

### Pitfall 3: Stale References in CLAUDE.md Confusing Future Agents
**What goes wrong:** `CLAUDE.md` still contains the v1.0 `STACK.md` snippet listing `better-sqlite3` and `Drizzle ORM`, causing future agent runs to propose SQLite migrations or imports.
**Why it happens:** `CLAUDE.md` was not updated when Phase 1 replaced SQLite with the file-backed `StateStore`.
**How to avoid:** Explicitly rewrite the State Machine, Database & Queue section in `CLAUDE.md` to describe the file-backed `StateStore`.
**Warning signs:** Agent tries to import `better-sqlite3` or look for `src/db/`.

## Code Examples

### 1. State Matrix Sync Test Parser Pattern
```typescript
// Source: tests/state-matrix-sync.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { GOLDEN_PATH_V2 } from '../src/pipeline/taxonomy.js';

describe('Authoritative ADO State Matrix Synchronization (TAX-02)', () => {
  it('strictly matches GOLDEN_PATH_V2 taxonomy definitions in ROADMAP.md', () => {
    const roadmapPath = path.resolve(process.cwd(), '.planning/ROADMAP.md');
    const content = fs.readFileSync(roadmapPath, 'utf8');

    const matrixHeader = '## Authoritative ADO State Matrix (Golden Path v2 — 5 columns / 9 steps / L1–L7)';
    const headerIdx = content.indexOf(matrixHeader);
    expect(headerIdx).toBeGreaterThan(-1);

    const section = content.slice(headerIdx);
    const tableLines = section
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('| 1. REFINEMENT') || l.startsWith('| 2. EXECUTION') || l.startsWith('| 3. ACCEPTANCE') || l.startsWith('| 4. RELEASE') || l.startsWith('| 5. RETRO'));

    expect(tableLines).toHaveLength(9);

    tableLines.forEach((line, index) => {
      const stepDef = GOLDEN_PATH_V2[index];
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      // cells: [Column, Step, Actor, ADO State, Key Tags, Evidence, Gate/Hand-off]
      expect(cells[0]).toContain(stepDef.column);
      expect(cells[1]).toContain(stepDef.name);
      expect(cells[2]).toContain(stepDef.actor === 'AI' ? '⚡' : '👤');
      expect(cells[3]).toContain(stepDef.adoState);
      stepDef.evidenceLevels.forEach((level) => {
        expect(cells[5]).toContain(level);
      });
      if (stepDef.keyTags) {
        stepDef.keyTags.forEach((tag) => {
          expect(cells[4]).toContain(tag);
        });
      }
    });
  });
});
```

### 2. End-to-End Golden Path Step Progression
```typescript
// Source: tests/e2e-v2-golden-path.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { adoClient } from '../src/ado/client.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { recordL3Evidence } from '../src/test-runner/evidence.js';
import { compileL1L7EvidenceIndex } from '../src/deploy/evidence-index.js';

describe('Golden Path v2 End-to-End Simulation (TAX-02)', () => {
  let harness: TestStateStoreContext;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
  });

  afterEach(() => {
    harness.cleanup();
    resetStateStore();
  });

  it('drives fixture ticket through all 9 steps accumulating non-null L1-L7 evidence', async () => {
    const workItemId = 9901;
    // Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6 -> Step 7 -> Step 8 -> Step 9 -> Done
    // Assert all 7 levels non-null in StateStore and archive file created
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1.0 8 stages (CONTRACT..LEARN) | Golden Path v2: 5 columns / 9 steps / L1–L7 | Milestone v2.0 | Explicit human vs AI actor roles, native ADO gates, and continuous feedback loop. [VERIFIED: `.idea/v2.md`] |
| SQLite/Drizzle relational database | File-backed `StateStore` (`data/state/tickets/<id>.md`) | Phase 1 | Single-writer per-ticket lane serializes writes; zero C++ binary compilation; zero migration tooling. [VERIFIED: `src/state/`] |
| L1–L6 partial evidence index | Unified L1–L7 evidence index with fail-closed validation | Phase 4, Phase 6 | Step 9 retro takeaways, action items, runbook PR, and skill PR persisted as auditable L7 record before `Done`. [VERIFIED: `src/deploy/evidence-index.ts`] |
| Manual doc reviews | Automated state-matrix-sync unit test | Phase 7 | CI automatically catches any drift between `ROADMAP.md` and `src/pipeline/taxonomy.ts`. [VERIFIED: Phase 7 design] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. All claims are verified against the codebase and test suite. | — | — |

## Open Questions (RESOLVED)

- **None:** Phase boundary is tightly defined by `07-CONTEXT.md` and `ROADMAP.md`. Test patterns and fixtures are fully established across existing test suites.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 24.0.2 | — |
| npm | Package manager | ✓ | 11.3.0 | — |
| Git CLI | Version control | ✓ | 2.53.0 | — |
| Vitest | Test execution | ✓ | 5.0.0 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^5.0.0` [VERIFIED: `package.json`] |
| Config file | `vitest.config.ts` [VERIFIED: `vitest.config.ts`] |
| Quick run command | `npx vitest run tests/state-matrix-sync.test.ts tests/e2e-v2-golden-path.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TAX-02 | End-to-end 9-step Golden Path v2 simulation on file-backed `StateStore` accumulating non-null L1–L7 evidence | integration | `npx vitest run tests/e2e-v2-golden-path.test.ts` | ❌ Wave 0 (Phase 7 deliverable) |
| TAX-02 | Authoritative ADO State Matrix in `ROADMAP.md` strictly mirrors `GOLDEN_PATH_V2` in code | unit | `npx vitest run tests/state-matrix-sync.test.ts` | ❌ Wave 0 (Phase 7 deliverable) |
| TAX-02 | Elimination of stale SQLite, 8-stage, and L1–L6 copy across `PROJECT.md`, `CLAUDE.md`, and `REQUIREMENTS.md` | static / unit | `npx vitest run tests/state-matrix-sync.test.ts` | ❌ Wave 0 (Phase 7 deliverable) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/state-matrix-sync.test.ts tests/e2e-v2-golden-path.test.ts`
- **Per wave merge:** `npm test` (all 44+ suites green)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e-v2-golden-path.test.ts` — covers full 9-step E2E simulation (TAX-02)
- [ ] `tests/state-matrix-sync.test.ts` — covers state matrix synchronization assertion (TAX-02)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | ADO PAT authentication managed at ingress/REST boundary. |
| V3 Session Management | no | Stateless webhook and polling architecture. |
| V4 Access Control | yes | Native ADO Environment and branch policy gates; human verdict gates at Steps 2, 4, 5, 6, 7 enforced in router. [VERIFIED: `src/execute/router.ts`] |
| V5 Input Validation | yes | `sanitize-html` applied to all evidence index comments, scope review packets, and retro summaries. [VERIFIED: `src/deploy/evidence-index.ts`] |
| V6 Cryptography | no | Cryptographic primitives not modified in Phase 7. |

### Known Threat Patterns for Documentation & Test E2E

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Documentation-Code Drift | Repudiation | Automated test `state-matrix-sync.test.ts` fails CI if `ROADMAP.md` and `src/pipeline/taxonomy.ts` diverge. |
| Leaked Test State / Polluted Repos | Tampering | Ephemeral test state stores via `createTestStateStore()` with automatic directory cleanup. |
| Stale Credential Instructions | Information Disclosure | Removal of SQLite/Drizzle references from `CLAUDE.md` and `PROJECT.md` prevents misconfigured persistence setups. |

## Sources

### Primary (HIGH confidence)
- `src/pipeline/taxonomy.ts` — `GOLDEN_PATH_V2` definition, step resolvers, tag normalizer [VERIFIED: codebase inspection]
- `src/execute/router.ts` — Taxonomy-driven router event dispatch and scope-lock guard [VERIFIED: codebase inspection]
- `src/deploy/evidence-index.ts` — `compileL1L7EvidenceIndex` and `formatEvidenceIndexComment` [VERIFIED: codebase inspection]
- `src/deploy/worker.ts` — Full deployment workflow: preparation, smoke suite, telemetry evaluation, retro loop, index attachment, archiving [VERIFIED: codebase inspection]
- `.planning/ROADMAP.md` — Authoritative ADO State Matrix (5 columns / 9 steps / L1–L7) [VERIFIED: codebase inspection]
- `.planning/phases/07-docs-realignment-e2e-proof/07-CONTEXT.md` — Phase 7 boundaries and deliverables [VERIFIED: codebase inspection]

### Secondary (MEDIUM confidence)
- `tests/lifecycle-replay.test.ts` — Baseline routing parity test harness [VERIFIED: codebase inspection]
- `tests/deploy-orchestrator.test.ts` — Deployment worker test harness and mock fixtures [VERIFIED: codebase inspection]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zero new dependencies; Node 24 + TS 7 + Vitest 5 verified on host.
- Architecture: HIGH - Fully established in Phases 1–6; Phase 7 ties them together via tests and doc updates.
- Pitfalls: HIGH - Known hazards (mocking too much, fragile regexes, stale documentation) catalogued with clear preventions.

**Research date:** 2026-09-18
**Valid until:** 2026-10-18 (stable milestone completion phase)
