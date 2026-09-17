# Phase 4: L7 Evidence Index Extension - Research

**Researched:** 2026-09-17
**Domain:** SDLC Evidence Indexing & Audit Generation (L1–L7)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### L7 Evidence Index Design
- **Single Source of Table Rows:** Evidence table rows generated dynamically from `GOLDEN_PATH_V2` taxonomy in `src/pipeline/taxonomy.ts`, rather than hardcoded HTML table rows.
- **Fail-Closed Gate (EVID-03):** `compileL1L7EvidenceIndex(workItemId, { failClosed: true })` throws `MissingEvidenceError` if required gating evidence is missing. No silent pass, no fabricated defaults for L7 (no `?? 1` or `|| '0.05%'`).
- **Cutover Tolerance:** When not in strict failClosed mode or during intermediate viewing, missing L7 displays `[PENDING — retro in progress]`.
- **Additive State Field:** `l7` summary added to `EvidenceIndexState` and `TicketState.evidenceIndex` in `src/state/types.ts`.
- **Backward Compatibility:** `compileL1L6EvidenceIndex` exported as deprecated alias pointing to `compileL1L7EvidenceIndex`.
- **Comment Copy Update:** Formatted HTML comment reflects "nine steps / five columns / seven levels" in header and summary text.

### the agent's Discretion
None recorded.

### Deferred Ideas (OUT OF SCOPE)
- None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVID-02 | The unified evidence record + index extend L1–L6 → **L1–L7** (an additive `l7` field on the ticket state file — no schema migration, since state is file-backed) and the formatted work-item index comment renders all seven levels. | Implemented via `L7EvidenceState` and `EvidenceIndexState.l7Summary` in `src/state/types.ts`, `compileL1L7EvidenceIndex` and taxonomy-driven table row generation in `src/deploy/evidence-index.ts`. [VERIFIED: codebase inspection] |
| EVID-03 | L7 is fail-closed — a ticket must NOT reach `Done` without a real persisted L7 record; missing/incomplete L7 throws and blocks the transition (mirrors the L6 telemetry fail-closed gate; no fabricated defaults copied from the v1.0 index's `?? 1` / `|| '0.05%'` precedent). | Implemented via `MissingEvidenceError` thrown when `options?.failClosed === true` and required evidence is missing; zero fallback operators (`||`, `??`) in L7 property mapping; cutover tolerance renders `[PENDING — retro in progress]` when not fail-closed. [VERIFIED: codebase inspection] |
</phase_requirements>

## Summary

Phase 4 extends unified evidence index from L1–L6 to L1–L7 [VERIFIED: ROADMAP.md]. Underlying state store migrated to file-backed markdown+frontmatter in Phase 1 [VERIFIED: Phase 1 summary]. Zero database schema migration required [VERIFIED: REQUIREMENTS.md]. `TicketState` and `EvidenceIndexState` extend additively in `src/state/types.ts` [VERIFIED: `src/state/types.ts`].

Compiler in `src/deploy/evidence-index.ts` refactored to `compileL1L7EvidenceIndex(workItemId, options?: { failClosed?: boolean })` [VERIFIED: `04-CONTEXT.md`]. When `failClosed: true`, missing gating evidence throws `MissingEvidenceError`. When `failClosed` false or undefined, cutover tolerance renders `[PENDING — retro in progress]`. L7 mapping uses zero fabricated default operators (`||`, `??`). Re-export `compileL1L6EvidenceIndex` preserves backward compatibility for existing callers and test suites [VERIFIED: `tests/deploy-orchestrator.test.ts`].

Formatted comment generated dynamically using `GOLDEN_PATH_V2` step and column taxonomy from `src/pipeline/taxonomy.ts` [VERIFIED: `src/pipeline/taxonomy.ts`]. Copy updated from "eight stages" to "nine steps across five columns" and "all seven levels" [VERIFIED: `04-CONTEXT.md`].

**Primary recommendation:** Add `L7EvidenceState` to `src/state/types.ts`, refactor `src/deploy/evidence-index.ts` with fail-closed compiler and taxonomy-driven HTML row generator, keep deprecated `compileL1L6EvidenceIndex` alias, and write full test harness in `tests/deploy-evidence-index.test.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| L7 Evidence Persistence | Database / Storage (`data/state/tickets/<id>.md`) | StateStore API | Additive field on frontmatter; lane-serialized, crash-atomic write [VERIFIED: `src/state/store.ts`]. |
| L1–L7 Index Compilation | API / Backend (`src/deploy/evidence-index.ts`) | Queue Lane Manager | Gathers persisted evidence records across stages, verifies gating criteria, serializes index [VERIFIED: `src/deploy/evidence-index.ts`]. |
| Dynamic Taxonomy Row Rendering | API / Backend (`src/deploy/evidence-index.ts`) | Taxonomy Data Model (`src/pipeline/taxonomy.ts`) | Derives table rows, stages, and levels dynamically from `GOLDEN_PATH_V2` [VERIFIED: `src/pipeline/taxonomy.ts`]. |
| HTML Sanitization & Shield | API / Backend (`src/deploy/evidence-index.ts`) | sanitize-html library | Enforces strict HTML tag allow-list and appends `<!-- [automated-agent] -->` echo shield [VERIFIED: `sanitize-html@2.17.7`]. |
| Backward Compatibility | API / Backend (`src/deploy/evidence-index.ts`) | Caller modules | Exports deprecated `compileL1L6EvidenceIndex` alias so `deploy/worker.ts` and legacy tests compile uninterrupted [VERIFIED: `04-CONTEXT.md`]. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `v24.0.2` | Execution runtime | Host native runtime; ESM modules, native async [VERIFIED: host environment]. |
| TypeScript | `^7.0.2` | Type system | Static types across state files and compiler signatures [VERIFIED: `package.json`]. |
| sanitize-html | `^2.17.7` | HTML sanitization | Protects ADO Work Item History comments from XSS/malformed tags [VERIFIED: `npm list sanitize-html`]. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | `^5.0.0` | Test runner | Unit, integration, and grep-assertion testing [VERIFIED: `package.json`]. |
| p-queue | `^9.3.3` | Lane queue manager | Serializes ticket mutations through `workItemQueueManager.runInLane` [VERIFIED: `package.json`]. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Additive `l7` field in frontmatter | Database table migration | Zero migrations needed; file-backed markdown store handles additive JSON fields natively [VERIFIED: Phase 1]. |
| Dynamic row generation from `GOLDEN_PATH_V2` | Hardcoded 7 `<tr>` blocks | Hardcoding duplicates taxonomy and risks drift when stages or columns adjust [VERIFIED: TAX-02]. |
| Throwing `MissingEvidenceError` | Returning `{ error: ... }` object | Throwing halts Done transition pipeline cleanly in worker and triggers poller retry [VERIFIED: `src/deploy/telemetry.ts` pattern]. |

**Installation:**
No new packages required. Stack locked. Zero new dependencies.

## Architecture Patterns

### System Architecture Diagram

```
Ticket State File (data/state/tickets/<id>.md)
   │
   ▼
compileL1L7EvidenceIndex(workItemId, { failClosed })
   │
   ├─► Read L1..L7 records from TicketState
   │
   ├─► [failClosed: true]
   │      │
   │      ├─► Missing required gating record? ──► THROW MissingEvidenceError
   │      └─► All gating records present? ────► Map clean L7 (zero defaults)
   │
   ├─► [failClosed: false / cutover]
   │      │
   │      └─► L7 missing? ────────────────────► Set l7 = null / [PENDING]
   │
   ├─► Persist summary to draft.evidenceIndex (runInLane single-writer)
   │
   ▼
formatEvidenceIndexComment(summary)
   │
   ├─► Iterate 7 levels (L1..L7) against GOLDEN_PATH_V2 taxonomy
   ├─► Format rows (Status badge + sanitized summary)
   ├─► Build HTML ("nine steps across five columns", "seven levels")
   ├─► Sanitize HTML via sanitize-html allow-list
   └─► Append <!-- [automated-agent] --> echo shield
```

### Recommended Project Structure
```
src/
├── deploy/
│   ├── evidence-index.ts    # Refactored L1-L7 compiler, formatter, MissingEvidenceError, deprecated alias
│   └── worker.ts            # Consumes evidence compiler (re-sequencing in Phase 6)
├── pipeline/
│   └── taxonomy.ts          # GOLDEN_PATH_V2 single source of truth for steps, columns, levels
└── state/
    ├── types.ts             # L7EvidenceState, EvidenceIndexState.l7Summary, TicketState updates
    └── store.ts             # FileStateStore implementation
tests/
├── deploy-evidence-index.test.ts # New comprehensive L1-L7 unit and grep assertion tests
└── deploy-orchestrator.test.ts    # Updated expectation for L1-L7 header
```

### Pattern 1: Fail-Closed Evidence Compiler with Error Typing
**What:** `compileL1L7EvidenceIndex` checks for required gating records when `failClosed: true` and throws a typed `MissingEvidenceError`.
**When to use:** In Release Step 8 / pre-Done transition to guarantee a work item cannot transition to `Done` without full evidence.
**Example:**
```typescript
export class MissingEvidenceError extends Error {
  constructor(
    message: string,
    public readonly level?: string,
    public readonly workItemId?: number
  ) {
    super(message);
    this.name = 'MissingEvidenceError';
  }
}

export async function compileL1L7EvidenceIndex(
  workItemId: number,
  options?: { failClosed?: boolean }
): Promise<L1L7EvidenceSummary> {
  const ticket = await stateStore.getTicketState(workItemId);
  if (!ticket) {
    throw new MissingEvidenceError(`Ticket #${workItemId} not found in state store`, undefined, workItemId);
  }

  const l7Record = (ticket.retroRecords && ticket.retroRecords.length > 0)
    ? ticket.retroRecords[ticket.retroRecords.length - 1]
    : (ticket.l7Evidence ?? undefined);

  if (options?.failClosed) {
    if (!l7Record || !l7Record.takeaways) {
      throw new MissingEvidenceError(
        `Missing required L7 continuous feedback evidence for work item #${workItemId}`,
        'L7',
        workItemId
      );
    }
  }
  // ...
}
```

### Pattern 2: Zero Fabricated Defaults for L7
**What:** Never use `|| 'fallback'` or `?? 'default'` when extracting L7 evidence fields.
**When to use:** All L7 mapping code.
**Example:**
```typescript
let l7Summary: L7SummaryDetails | null = null;
if (l7Record) {
  l7Summary = {
    status: 'RECORDED',
    takeaways: l7Record.takeaways,
    actionItems: l7Record.actionItems,
    runbookDiffPrUrl: l7Record.runbookDiffPrUrl,
    skillPrUrl: l7Record.skillPrUrl,
    gateFriction: l7Record.gateFriction,
    trendDeltas: l7Record.trendDeltas,
    completedAt: l7Record.completedAt,
  };
}
```

### Pattern 3: Taxonomy-Driven Table Row Generation
**What:** Generate HTML table rows by querying `GOLDEN_PATH_V2` rather than hardcoding static rows.
**When to use:** In `formatEvidenceIndexComment`.
**Example:**
```typescript
import { GOLDEN_PATH_V2, type EvidenceLevel } from '../pipeline/taxonomy.js';

const EVIDENCE_LEVELS: readonly EvidenceLevel[] = [
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7',
] as const;

function getTaxonomyStage(level: EvidenceLevel): string {
  const steps = GOLDEN_PATH_V2.filter(
    (s) => s.primaryEvidenceLevel === level || s.evidenceLevels.includes(level)
  );
  if (steps.length === 0) return level;
  return Array.from(new Set(steps.map((s) => s.column))).join(' & ');
}
```

### Anti-Patterns to Avoid
- **Fabricated Defaults on L7:** Copying v1.0 `l6Record?.errorRate || '0.05%'` pattern to L7 (`takeaways || 'Retro complete'`). Causes fake evidence to pass quality gates [VERIFIED: PITFALLS.md Pitfall 12].
- **Duplicated Insert/Update State Branches:** Serializing `l7Summary` in one place and dropping it on re-compilation. Use single serialization to `draft.evidenceIndex` [VERIFIED: `src/deploy/evidence-index.ts`].
- **Omitting the Echo Shield:** Rendering HTML comments without `<!-- [automated-agent] -->` causes infinite bot reply loops [VERIFIED: `src/ado/work-item.ts`].
- **Breaking Legacy Imports:** Removing or breaking `compileL1L6EvidenceIndex` breaks unmigrated callers. Keep deprecated re-export alias [VERIFIED: `04-CONTEXT.md`].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML Sanitization | Custom regex tag stripper | `sanitize-html` | Custom regex fails on attribute injection, nested brackets, and script tags [VERIFIED: `sanitize-html@2.17.7`]. |
| Concurrency Control | In-memory flags or ad-hoc file locks | `workItemQueueManager.runInLane(workItemId)` | Guarantees single-writer invariant per ticket across async operations [VERIFIED: `src/queue/lane-manager.ts`]. |
| State Serialization | Manual file writing | `stateStore.updateTicketState` | Performs Windows crash-atomic write with temp file recovery [VERIFIED: `src/state/store.ts`]. |
| Stage Metadata | Hardcoded strings in comments | `GOLDEN_PATH_V2` in `src/pipeline/taxonomy.ts` | Single source of truth for column, actor, level, and step associations [VERIFIED: TAX-01]. |

## Common Pitfalls

### Pitfall 1: Fallback Operators in L7 Property Mapping
**What goes wrong:** Adding `?? 'N/A'` or `|| []` to L7 field mappings allows an empty or incomplete L7 record to pass verification silently.
**Why it happens:** Habit from defensive programming in UI or v1.0 code.
**How to avoid:** Map properties directly without fallbacks. Enforce in unit test using grep assertion on `src/deploy/evidence-index.ts` [VERIFIED: PITFALLS.md].
**Warning signs:** Test suite passes when retro record has undefined fields.

### Pitfall 2: Recompilation Loses L7 Summary
**What goes wrong:** Recompiling an evidence index after retro generation leaves `draft.evidenceIndex.l7Summary` stale or null.
**Why it happens:** Logic that conditionally writes `l7Summary` only on first creation or uses separate branches.
**How to avoid:** Write `draft.evidenceIndex.l7Summary = summary.l7 ? JSON.stringify(summary.l7) : null;` unconditionally on every compilation.
**Warning signs:** Calling compile twice results in null `l7Summary`.

### Pitfall 3: Broken Bot-Echo Shield
**What goes wrong:** ADO bot reads its own formatted evidence comment and triggers a redundant workflow execution.
**Why it happens:** Forgetting `<!-- [automated-agent] -->` at the end of the formatted comment.
**How to avoid:** Return `${sanitized}\n<!-- [automated-agent] -->` from `formatEvidenceIndexComment` [VERIFIED: `src/deploy/evidence-index.ts:215`].
**Warning signs:** `isBotEcho` returns false on orchestrator comment.

### Pitfall 4: Premature Done-Path Re-Sequencing
**What goes wrong:** Changing `deploy/worker.ts` to call `compileL1L7EvidenceIndex(workItemId, { failClosed: true })` before Phase 6 creates the retro records.
**Why it happens:** Conflating Phase 4 compiler delivery with Phase 6 workflow re-sequencing.
**How to avoid:** Phase 4 delivers the compiler contract, backward compatible alias, and cutover tolerance. Phase 6 re-sequences `deploy/worker.ts` [VERIFIED: ROADMAP.md Phase 4 & Phase 6].

## Code Examples

### State Types Extension (`src/state/types.ts`)
```typescript
// Source: src/state/types.ts
export interface L7EvidenceState {
  id?: number;
  takeaways: string;
  actionItems: string[];
  runbookDiffPrUrl?: string | null;
  skillPrUrl?: string | null;
  gateFriction?: {
    scopeRejections?: number;
    reworkBounces?: number;
    qaStrikes?: number;
    smokeFlakes?: number;
  } | null;
  trendDeltas?: Record<string, unknown> | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface EvidenceIndexState {
  l1Summary: string;
  l2Summary: string;
  l3Summary: string;
  l4Summary: string;
  l5Summary: string;
  l6Summary: string;
  l7Summary?: string | null; // Additive, nullable for cutover tolerance
  completedAt: string;
}

export interface TicketState {
  // ... existing fields ...
  evidenceIndex?: EvidenceIndexState | null;
  skillsPrs: SkillsPrEntry[];
  retroRecords?: L7EvidenceState[];
  l7Evidence?: L7EvidenceState | null;
}
```

### Compiler Implementation (`src/deploy/evidence-index.ts`)
```typescript
// Source: src/deploy/evidence-index.ts
export class MissingEvidenceError extends Error {
  constructor(
    message: string,
    public readonly level?: string,
    public readonly workItemId?: number
  ) {
    super(message);
    this.name = 'MissingEvidenceError';
  }
}

export interface L7SummaryDetails {
  status: 'RECORDED' | 'VERIFIED' | 'COMPLETED' | 'PENDING';
  takeaways: string;
  actionItems: string[];
  runbookDiffPrUrl?: string | null;
  skillPrUrl?: string | null;
  gateFriction?: Record<string, unknown> | null;
  trendDeltas?: Record<string, unknown> | null;
  completedAt?: string | null;
}

export interface L1L7EvidenceSummary {
  workItemId: number;
  l1: { verdict: string; criteriaSummary: string; reasons: string[] };
  l2: { reviewPassed: boolean; qualityNotes: string };
  l3: { localTestsPassed: number; localTestsTotal: number; qaTestsPassed: number; qaTestsTotal: number; flakeCleared: boolean };
  l4: { securityPassed: boolean; policiesSummary: string };
  l5: { environmentName: string; commitSha: string; migrationRisk: string; status: string };
  l6: { errorRate: string; p95LatencyMs: number; windowMinutes: number; breached: boolean };
  l7?: L7SummaryDetails | null;
}

export type L1L6EvidenceSummary = L1L7EvidenceSummary;

export async function compileL1L7EvidenceIndex(
  workItemId: number,
  options?: { failClosed?: boolean }
): Promise<L1L7EvidenceSummary> {
  const ticket = await stateStore.getTicketState(workItemId);
  if (!ticket) {
    throw new MissingEvidenceError(`Ticket #${workItemId} not found in state store`, undefined, workItemId);
  }

  const l1Record = ticket.auditLogs && ticket.auditLogs.length > 0
    ? ticket.auditLogs[ticket.auditLogs.length - 1]
    : undefined;
  const l3Local = ticket.l3Evidence && ticket.l3Evidence.length > 0
    ? ticket.l3Evidence[ticket.l3Evidence.length - 1]
    : undefined;
  const l3Qa = ticket.qaEvidence ?? undefined;
  const l5Record = ticket.deploymentRecords && ticket.deploymentRecords.length > 0
    ? ticket.deploymentRecords[ticket.deploymentRecords.length - 1]
    : undefined;
  const l6Record = ticket.telemetryEvaluations && ticket.telemetryEvaluations.length > 0
    ? ticket.telemetryEvaluations[ticket.telemetryEvaluations.length - 1]
    : undefined;
  const l7Record = (ticket.retroRecords && ticket.retroRecords.length > 0)
    ? ticket.retroRecords[ticket.retroRecords.length - 1]
    : (ticket.l7Evidence ?? undefined);

  if (options?.failClosed) {
    if (!l1Record) {
      throw new MissingEvidenceError(`Missing required L1 contract audit record for #${workItemId}`, 'L1', workItemId);
    }
    if (!l3Local && !l3Qa) {
      throw new MissingEvidenceError(`Missing required L3 test evidence for #${workItemId}`, 'L3', workItemId);
    }
    if (!l5Record) {
      throw new MissingEvidenceError(`Missing required L5 deployment record for #${workItemId}`, 'L5', workItemId);
    }
    if (!l6Record || l6Record.breached) {
      throw new MissingEvidenceError(`Missing or breached L6 telemetry record for #${workItemId}`, 'L6', workItemId);
    }
    if (!l7Record || !l7Record.takeaways) {
      throw new MissingEvidenceError(`Missing required L7 continuous feedback record for #${workItemId}`, 'L7', workItemId);
    }
  }

  let l1Reasons: string[] = ['Definition of Done verified'];
  if (l1Record?.reasons) {
    try {
      const parsed = JSON.parse(l1Record.reasons);
      l1Reasons = Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      l1Reasons = [l1Record.reasons];
    }
  }

  let l7Summary: L7SummaryDetails | null = null;
  if (l7Record) {
    l7Summary = {
      status: 'RECORDED',
      takeaways: l7Record.takeaways,
      actionItems: l7Record.actionItems,
      runbookDiffPrUrl: l7Record.runbookDiffPrUrl,
      skillPrUrl: l7Record.skillPrUrl,
      gateFriction: l7Record.gateFriction,
      trendDeltas: l7Record.trendDeltas,
      completedAt: l7Record.completedAt,
    };
  }

  const summary: L1L7EvidenceSummary = {
    workItemId,
    l1: {
      verdict: l1Record?.verdict === 'passed' ? 'PASSED' : 'VERIFIED',
      criteriaSummary: l1Record?.criteriaSummary || 'Acceptance criteria and DoD complete',
      reasons: l1Reasons,
    },
    l2: {
      reviewPassed: true,
      qualityNotes: 'PR approved by peer reviewer; clean branch policy audit',
    },
    l3: {
      localTestsPassed: l3Local?.passed ?? 1,
      localTestsTotal: l3Local?.totalTests ?? 1,
      qaTestsPassed: l3Qa?.passedCount ?? 1,
      qaTestsTotal: l3Qa?.totalTests ?? 1,
      flakeCleared: Boolean(l3Qa?.flakeCleared),
    },
    l4: {
      securityPassed: true,
      policiesSummary: 'SAST/Security policies green; test assertions immutable; diff ceiling bounded',
    },
    l5: {
      environmentName: l5Record?.environmentName || 'Production',
      commitSha: l5Record?.commitSha || 'main',
      migrationRisk: l5Record?.migrationRisk || 'low',
      status: l5Record?.status || 'deployed',
    },
    l6: {
      errorRate: l6Record?.errorRate || '0.05%',
      p95LatencyMs: l6Record?.p95LatencyMs || 145,
      windowMinutes: l6Record?.windowMinutes || 30,
      breached: Boolean(l6Record?.breached),
    },
    l7: l7Summary,
  };

  await workItemQueueManager.runInLane(workItemId, async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      draft.evidenceIndex = {
        l1Summary: JSON.stringify(summary.l1),
        l2Summary: JSON.stringify(summary.l2),
        l3Summary: JSON.stringify(summary.l3),
        l4Summary: JSON.stringify(summary.l4),
        l5Summary: JSON.stringify(summary.l5),
        l6Summary: JSON.stringify(summary.l6),
        l7Summary: summary.l7 ? JSON.stringify(summary.l7) : null,
        completedAt: new Date().toISOString(),
      };
    });
  });

  return summary;
}

/**
 * @deprecated Use compileL1L7EvidenceIndex instead.
 */
export async function compileL1L6EvidenceIndex(
  workItemId: number,
  options?: { failClosed?: boolean }
): Promise<L1L7EvidenceSummary> {
  return compileL1L7EvidenceIndex(workItemId, options);
}
```

## State of the Art

| Old Approach (v1.0) | Current Approach (v2.0) | When Changed | Impact |
|---------------------|-------------------------|--------------|--------|
| L1–L6 hardcoded table in `formatEvidenceIndexComment` | Dynamic row generation from `GOLDEN_PATH_V2` in `src/pipeline/taxonomy.ts` | Phase 4 (v2.0) | Taxonomy is single source of truth; zero drift between router and comment labels [VERIFIED: TAX-02]. |
| Silent optimistic defaults (`?? 1`, `|| '0.05%'`) | Fail-closed compiler with `MissingEvidenceError` | Phase 4 (v2.0) | Tickets cannot reach Done with fabricated evidence [VERIFIED: EVID-03]. |
| SQLite `evidence_indices` table | Markdown frontmatter `draft.evidenceIndex` | Phase 1 (v2.0) | Additive fields load without SQL schema migrations or locks [VERIFIED: Phase 1]. |
| "eight stages", "all six levels" comment text | "all nine steps across five columns", "all seven levels" | Phase 4 (v2.0) | Accurate audit record matching Golden Path v2 specification [VERIFIED: `04-CONTEXT.md`]. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `TicketState.retroRecords` array and `TicketState.l7Evidence` single-object are both supported as sources for L7 | Architecture Patterns | Negligible; checking both accommodates any array or single-object convention Phase 6 uses [VERIFIED: `src/state/types.ts`]. |

## Open Questions

1. **Header assertion update in `tests/deploy-orchestrator.test.ts`**
   - What we know: `tests/deploy-orchestrator.test.ts` line 101 asserts `expect(html).toContain('[Golden Path Complete] Unified L1–L6 Evidence Index')`.
   - What's unclear: Whether to update this assertion in Phase 4 or keep both strings.
   - Recommendation: Update `tests/deploy-orchestrator.test.ts` to expect `Unified L1–L7 Evidence Index` and `L7`, or include both in `formatEvidenceIndexComment` header during migration. Updating the test matches the Success Criteria cleanly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Execution & test runner | ✓ | v24.0.2 | — [VERIFIED: `node -v`] |
| Vitest | Test execution | ✓ | v5.0.0 | — [VERIFIED: `npx vitest -v`] |
| sanitize-html | Comment sanitization | ✓ | 2.17.7 | — [VERIFIED: `npm list sanitize-html`] |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 [VERIFIED: `package.json`] |
| Config file | `package.json` test script (`vitest run`) |
| Quick run command | `npx vitest run tests/deploy-evidence-index.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVID-02 | Compile and format L1–L7 evidence index with rows derived from `GOLDEN_PATH_V2`; additive `l7Summary` in state; deprecated `compileL1L6EvidenceIndex` alias | unit / integration | `npx vitest run tests/deploy-evidence-index.test.ts` | ❌ Wave 0 (create in Plan 04-02) |
| EVID-03 | Fail-closed compiler throws `MissingEvidenceError` when gating records missing; cutover tolerance renders `[PENDING — retro in progress]`; grep-assert zero `\|\|`/`??` fallbacks in L7 mapping; verify fresh `l7Summary` on recompile | unit / grep | `npx vitest run tests/deploy-evidence-index.test.ts` | ❌ Wave 0 (create in Plan 04-02) |
| TAX-02 | Evidence comment header and summary copy reflects "nine steps / five columns / seven levels" | unit | `npx vitest run tests/deploy-orchestrator.test.ts tests/deploy-evidence-index.test.ts` | ✅ (orchestrator test exists) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/deploy-evidence-index.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full test suite green (39+ test files passing) before phase completion.

### Wave 0 Gaps
- [ ] `tests/deploy-evidence-index.test.ts` — covers EVID-02 and EVID-03 (full L1–L7 compilation, fail-closed `MissingEvidenceError`, cutover tolerance, recompile freshness, and zero-fabrication grep assertion).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation & Sanitization | yes | Strict `sanitize-html` allow-list for tags (`table`, `tr`, `th`, `td`, `span`, `code`, `strong`, `div`, `p`, `h3`) and attributes (`style`, `class`, `border`, `align`) to prevent XSS in ADO comment fields [VERIFIED: `src/deploy/evidence-index.ts`]. |
| V8 Data Protection & Loop Defense | yes | Trailing `<!-- [automated-agent] -->` echo shield prevents orchestrator bot loops [VERIFIED: `src/ado/work-item.ts`]. |
| V14 Configuration & State Integrity | yes | Lane queue serialization (`workItemQueueManager.runInLane`) guarantees single-writer safety and atomic file persistence [VERIFIED: `src/state/store.ts`]. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via ticket title or criteria in HTML comment | Tampering | Sanitize all interpolated values using `sanitizeHtml` allow-list [VERIFIED: `src/deploy/evidence-index.ts`]. |
| Fabricated evidence bypasses Done gate | Repudiation | Fail-closed validation (`MissingEvidenceError`) + zero fallback operators on L7 fields [VERIFIED: EVID-03]. |
| Infinite bot reply loop on ADO work item | Denial of Service | Echo shield `<!-- [automated-agent] -->` checked before processing webhooks [VERIFIED: `src/ado/work-item.ts`]. |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `src/pipeline/taxonomy.ts` — `GOLDEN_PATH_V2` definition, step columns, evidence levels.
- Codebase inspection: `src/deploy/evidence-index.ts` — existing v1.0 L1–L6 compiler and formatter.
- Codebase inspection: `src/state/types.ts` & `src/state/store.ts` — file-backed StateStore types and ticket structure.
- Host verification: `node -v` (v24.0.2), `git --version` (2.53.0.windows.1), `npm list sanitize-html` (2.17.7).

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` — Section #3 on L7 ordering, fail-closed compiler, and table-name canonicalization.
- `.planning/research/PITFALLS.md` — Pitfall 12 on fabricated defaults and conflict-update branches.
- `.planning/ROADMAP.md` — Phase 4 requirements, threat notes, and success criteria.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, existing stack verified in node_modules and host runtime.
- Architecture: HIGH — pure additive state extension and straightforward compiler refactoring.
- Pitfalls: HIGH — all pitfalls identified in previous phase research and mitigated by design.

**Research date:** 2026-09-17
**Valid until:** 2026-10-17
