# Phase 04: L7 Evidence Index Extension - Pattern Map

**Mapped:** 2026-09-17
**Files analyzed:** 4
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/state/types.ts` | model | request-response | `src/state/types.ts` | exact |
| `src/deploy/evidence-index.ts` | service | transform | `src/deploy/evidence-index.ts` | exact |
| `tests/deploy-evidence-index.test.ts` | test | request-response | `tests/deploy-orchestrator.test.ts` | exact |
| `tests/deploy-orchestrator.test.ts` | test | request-response | `tests/deploy-orchestrator.test.ts` | exact |

## Pattern Assignments

### `src/state/types.ts` (model, request-response)

**Analog:** `src/state/types.ts` (lines 113-133, 146-163)

**Imports pattern:**
None. Pure TypeScript interface definitions.

**Data Model pattern** (`src/state/types.ts` lines 113-133, 146-163):
```typescript
export interface TelemetryEvaluationEntry {
  id?: number;
  windowMinutes: number;
  errorRate: string;
  p95LatencyMs: number;
  baselineErrorRate?: string | null;
  baselineP95Ms?: number | null;
  breached: number;
  breachReasons?: string | null;
  evaluatedAt: string;
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
  workItemId: number;
  revId: number;
  createdAt: string;
  updatedAt: string;
  auditLogs: AuditLogEntry[];
  planCheckpoints: PlanCheckpointState[];
  l3Evidence: L3EvidenceEntry[];
  scopeLock?: ScopeLockState | null;
  reworkCycles?: ReworkCycleState | null;
  qaRuns: QaRunEntry[];
  qaBounces?: QaBounceState | null;
  qaEvidence?: QaEvidenceState | null;
  deploymentRecords: DeploymentRecordEntry[];
  telemetryEvaluations: TelemetryEvaluationEntry[];
  evidenceIndex?: EvidenceIndexState | null;
  skillsPrs: SkillsPrEntry[];
  retroRecords?: L7EvidenceState[];
  l7Evidence?: L7EvidenceState | null;
}
```

---

### `src/deploy/evidence-index.ts` (service, transform)

**Analog:** `src/deploy/evidence-index.ts` (lines 1-126, 128-216) & `src/pipeline/taxonomy.ts` (lines 34-152)

**Imports pattern** (`src/deploy/evidence-index.ts` lines 1-3 + taxonomy import):
```typescript
import sanitizeHtml from 'sanitize-html';
import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { GOLDEN_PATH_V2, type EvidenceLevel } from '../pipeline/taxonomy.js';
```

**Error handling pattern** (`src/state/store.ts` lines 7-14 + fail-closed guard):
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
```

**Core Compiler pattern** (`src/deploy/evidence-index.ts` lines 41-125):
```typescript
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

  // Zero-fallback direct mapping for L7
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
    l1: { /* ... */ },
    l2: { /* ... */ },
    l3: { /* ... */ },
    l4: { /* ... */ },
    l5: { /* ... */ },
    l6: { /* ... */ },
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

**Taxonomy-Driven HTML Comment Formatter pattern** (`src/deploy/evidence-index.ts` lines 128-216):
```typescript
export function formatEvidenceIndexComment(summary: L1L7EvidenceSummary): string {
  const { workItemId } = summary;

  // Derives stage names dynamically from taxonomy steps
  const getStageName = (level: EvidenceLevel): string => {
    const steps = GOLDEN_PATH_V2.filter(
      (s) => s.primaryEvidenceLevel === level || s.evidenceLevels.includes(level)
    );
    if (steps.length === 0) return level;
    return Array.from(new Set(steps.map((s) => s.column))).join(' & ');
  };

  // Build rows for L1..L7 using getStageName, applying cutover tolerance [PENDING — retro in progress] when summary.l7 is missing

  const html = `
<div class="golden-path-evidence-index">
  <h3>🎉 [Golden Path Complete] Unified L1–L7 Evidence Index</h3>
  <p>Work item #${workItemId} has successfully completed all nine steps across five columns of the Agentic SDLC Golden Path with verifiable evidence across all seven levels.</p>
  ...
</div>
`.trim();

  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'h3', 'p', 'code', 'strong',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      div: ['class'],
      span: ['style'],
      table: ['border', 'cellpadding', 'cellspacing', 'style'],
      tr: ['style'],
      th: ['align'],
      td: ['align'],
    },
  });

  return `${sanitized}\n<!-- [automated-agent] -->`;
}
```

---

### `tests/deploy-evidence-index.test.ts` (test, request-response)

**Analog:** `tests/deploy-orchestrator.test.ts` (lines 1-110)

**Imports pattern** (`tests/deploy-orchestrator.test.ts` lines 1-17):
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { env } from '../src/config/env.js';
import {
  compileL1L7EvidenceIndex,
  compileL1L6EvidenceIndex,
  formatEvidenceIndexComment,
  MissingEvidenceError,
} from '../src/deploy/evidence-index.js';
```

**Harness Lifecycle pattern** (`tests/deploy-orchestrator.test.ts` lines 18-34):
```typescript
describe('Evidence Index L1-L7 Compiler (EVID-02, EVID-03)', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
  });

  it('compiles full L1-L7 evidence and formats taxonomy-derived table rows', async () => {
    // Seed stateStore via workItemQueueManager.runInLane
    // Assert summary and HTML comment
  });

  it('throws MissingEvidenceError when failClosed is true and required evidence is missing', async () => {
    // Assert reject with MissingEvidenceError
  });

  it('renders cutover tolerance [PENDING — retro in progress] when failClosed is false', async () => {
    // Assert html contains pending indicator
  });

  it('verifies zero fallback operators in L7 mapping code via grep assertion', () => {
    const src = fs.readFileSync(path.resolve('src/deploy/evidence-index.ts'), 'utf8');
    const l7Section = src.slice(src.indexOf('l7Record'), src.indexOf('const summary'));
    expect(l7Section).not.toMatch(/takeaways\s*(\?\?|\|\|)/);
    expect(l7Section).not.toMatch(/actionItems\s*(\?\?|\|\|)/);
  });
});
```

---

### `tests/deploy-orchestrator.test.ts` (test, request-response)

**Analog:** `tests/deploy-orchestrator.test.ts` (lines 90-109)

**Core pattern update** (`tests/deploy-orchestrator.test.ts` lines 100-109):
```typescript
      const html = formatEvidenceIndexComment(summary);
      expect(html).toContain('[Golden Path Complete] Unified L1–L7 Evidence Index');
      expect(html).toContain('L1');
      expect(html).toContain('L2');
      expect(html).toContain('L3');
      expect(html).toContain('L4');
      expect(html).toContain('L5');
      expect(html).toContain('L6');
      expect(html).toContain('L7');
      expect(html).toContain('<!-- [automated-agent] -->');
```

---

## Shared Patterns

### Lane Queue Serialization & Crash-Atomic Persistence
**Source:** `src/deploy/evidence-index.ts` lines 111-123 & `src/state/store.ts` lines 39-85
**Apply to:** All state mutations on ticket documents
```typescript
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
```

### HTML Sanitization & Echo Shield
**Source:** `src/deploy/evidence-index.ts` lines 189-216
**Apply to:** All HTML comments posted to ADO work item history
```typescript
const sanitized = sanitizeHtml(html, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'h3', 'p', 'code', 'strong',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    div: ['class'],
    span: ['style'],
    table: ['border', 'cellpadding', 'cellspacing', 'style'],
    tr: ['style'],
    th: ['align'],
    td: ['align'],
  },
});

return `${sanitized}\n<!-- [automated-agent] -->`;
```

### Fail-Closed Missing Evidence Guard
**Source:** `src/deploy/telemetry.ts` lines 34-37 & `src/deploy/evidence-index.ts`
**Apply to:** All gating-level verification checks
```typescript
if (options?.failClosed) {
  if (!record || !record.requiredField) {
    throw new MissingEvidenceError(
      `Missing required ${level} evidence for work item #${workItemId}`,
      level,
      workItemId
    );
  }
}
```

## No Analog Found

None. All files have exact analogs in the codebase.

## Metadata

**Analog search scope:** `src/deploy/`, `src/state/`, `src/pipeline/`, `tests/`
**Files scanned:** 6
**Pattern extraction date:** 2026-09-17
