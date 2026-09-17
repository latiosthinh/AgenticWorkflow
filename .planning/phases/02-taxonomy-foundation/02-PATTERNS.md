# Phase 02: Taxonomy Foundation - Pattern Map

**Mapped:** 2026-09-17
**Files analyzed:** 4
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/pipeline/taxonomy.ts` | model | request-response | `src/accept/verdict.ts` | exact |
| `src/execute/router.ts` | controller | request-response | `src/execute/router.ts` | exact |
| `tests/taxonomy.test.ts` | test | request-response | `tests/verdict-detector.test.ts` | exact |
| `tests/lifecycle-replay.test.ts` | test | request-response | `tests/rework-integration.test.ts` | exact |

---

## Pattern Assignments

### `src/pipeline/taxonomy.ts` (model, request-response)

**Analog:** `src/accept/verdict.ts` (pure domain types, immutable constants, query helpers, zero runtime dependencies)

**Imports pattern** (zero external dependencies):
```typescript
// Pure TypeScript definition - no runtime dependencies
```

**Core types & frozen data structure pattern** (analogous to `src/accept/verdict.ts` lines 1-12 and `src/state/types.ts` lines 1-12):
```typescript
export type ColumnId =
  | 'REFINEMENT'
  | 'EXECUTION'
  | 'ACCEPTANCE'
  | 'RELEASE'
  | 'RETRO';

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ActorRole = 'AI' | 'Human';
export type EvidenceLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';
export type AdoState =
  | 'New'
  | 'Ready to Dev'
  | 'In Dev'
  | 'Dev Done'
  | 'Ready for QA'
  | 'Ready to Deploy'
  | 'Done';

export interface StepDefinition {
  readonly step: StepNumber;
  readonly name: string;
  readonly column: ColumnId;
  readonly actor: ActorRole;
  readonly actorDetail: string;
  readonly evidenceLevels: readonly EvidenceLevel[];
  readonly primaryEvidenceLevel: EvidenceLevel;
  readonly adoState: AdoState;
  readonly gateType: 'human_verdict' | 'automated_trigger';
  readonly keyTags?: readonly string[];
  readonly description?: string;
}

export const GOLDEN_PATH_V2: readonly StepDefinition[] = Object.freeze([
  Object.freeze({
    step: 1,
    name: 'Ticket & AC verify',
    column: 'REFINEMENT',
    actor: 'AI',
    actorDetail: 'AI Agent',
    evidenceLevels: ['L1'],
    primaryEvidenceLevel: 'L1',
    adoState: 'New',
    gateType: 'automated_trigger',
    keyTags: ['[audit-passed]', '[awaiting-scope-lock]'],
  }),
  // ... steps 2-9 frozen
]);
```

**Lookup helpers pattern** (analogous to `src/accept/verdict.ts` lines 14-50):
```typescript
export function resolveRoutingStep(
  state: string,
  tags?: string[] | null
): StepDefinition | undefined {
  if (tags && tags.includes('[awaiting-input]')) {
    return GOLDEN_PATH_V2.find((s) => s.step === 3);
  }
  switch (state) {
    case 'New':
      return GOLDEN_PATH_V2.find((s) => s.step === 1);
    case 'Ready to Dev':
      return GOLDEN_PATH_V2.find((s) => s.step === 2);
    case 'In Dev':
      return GOLDEN_PATH_V2.find((s) => s.step === 3);
    case 'Dev Done':
      return GOLDEN_PATH_V2.find((s) => s.step === 4);
    case 'Ready for QA':
      return GOLDEN_PATH_V2.find((s) => s.step === 6);
    case 'Ready to Deploy':
      return GOLDEN_PATH_V2.find((s) => s.step === 7);
    case 'Done':
      return GOLDEN_PATH_V2.find((s) => s.step === 9);
    default:
      return undefined;
  }
}

export function getStepByNumber(step: StepNumber): StepDefinition | undefined {
  return GOLDEN_PATH_V2.find((s) => s.step === step);
}

export function getStepsByColumn(column: ColumnId): readonly StepDefinition[] {
  return GOLDEN_PATH_V2.filter((s) => s.column === column);
}

export function getStepsByAdoState(state: string): readonly StepDefinition[] {
  return GOLDEN_PATH_V2.filter((s) => s.adoState === state);
}
```

**Ponytail convention** (analogous to `src/accept/verdict.ts` line 52):
```typescript
// ponytail: static step descriptors; load from project taxonomy schema in v2.x
```

---

### `src/execute/router.ts` (controller, request-response)

**Analog:** `src/execute/router.ts` (in-place refactoring)

**Imports pattern** (lines 1-21 + new taxonomy import):
```typescript
import { stateStore } from '../state/index.js';
import {
  getWorkItemDetails,
  updateWorkItemTags,
  escalateReworkToBlocked,
} from '../ado/work-item.js';
import { processWorkItemAudit } from '../auditor/worker.js';
import { processWorkItemExecute } from './worker.js';
import { detectAcceptanceVerdict } from '../accept/verdict.js';
import {
  evaluateCircuitBreaker,
  resetCircuitBreaker,
} from '../accept/breaker.js';
import { processWorkItemRework } from './rework-worker.js';
import { createOrGetPullRequest } from '../ado/git.js';
import { formatPrDescription } from '../ado/formatter.js';
import { processQaVerification } from '../qa/worker.js';
import { processDeploymentWorkflow } from '../deploy/worker.js';
import { env } from '../config/env.js';
import { slugify } from '../utils/paths.js';
import { resolveRoutingStep } from '../pipeline/taxonomy.js';
```

**Verdict precedence pattern** (lines 71-95 must remain first):
```typescript
    const verdict = detectAcceptanceVerdict({
      currentState: workItem.state,
      previousState,
      historyComment: workItem.history,
      tags: workItem.tags,
    });

    if (verdict.type === 'reset_rework') {
      await resetCircuitBreaker(workItemId);
      stateStore.updateDedupStatus(workItemId, revId, 'completed');
    } else if (verdict.type === 'approve') {
      await updateWorkItemTags(
        workItemId,
        '[acceptance-approved]',
        '[awaiting-acceptance]'
      );
      stateStore.updateDedupStatus(workItemId, revId, 'completed');
    } else if (verdict.type === 'reject') {
      const breaker = await evaluateCircuitBreaker(workItemId, 'accept');
      if (!breaker.allowed) {
        await escalateReworkToBlocked(workItemId, breaker.currentCount);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
      } else {
        await processWorkItemRework(workItemId, revId, verdict.feedback, options);
      }
    }
```

**Taxonomy-driven routing switch pattern** (replaces lines 96-161):
```typescript
    const step = resolveRoutingStep(workItem.state, workItem.tags);

    if (!step) {
      stateStore.updateDedupStatus(
        workItemId,
        revId,
        'skipped',
        `Ticket state '${workItem.state}' has no active handler`
      );
      return;
    }

    switch (step.step) {
      case 1:
        await processWorkItemAudit(workItemId, revId);
        break;
      case 3:
        await processWorkItemExecute(workItemId, revId, options);
        break;
      case 4: {
        const ticket = await stateStore.getTicketState(workItemId);
        const evidence = ticket?.l3Evidence && ticket.l3Evidence.length > 0
          ? ticket.l3Evidence[ticket.l3Evidence.length - 1]
          : undefined;

        const testSummary = evidence
          ? {
              suite: evidence.testSuite,
              totalTests: evidence.totalTests,
              passed: evidence.passed,
              failed: evidence.failed,
              durationMs: evidence.durationMs,
            }
          : {
              suite: 'vitest',
              totalTests: 1,
              passed: 1,
              failed: 0,
              durationMs: 100,
            };

        const diffStat = parseDiffStat(evidence?.gitDiffStat);

        const prDescription = formatPrDescription({
          workItemId,
          title: workItem.title,
          acceptanceCriteria: workItem.acceptanceCriteria,
          testSummary,
          diffStat,
        });

        const slug = slugify(workItem.title);
        const sourceBranch = `task/ticket-${workItemId}-${slug}`;

        await createOrGetPullRequest({
          workItemId,
          title: workItem.title,
          sourceBranch,
          description: prDescription,
          projectId: env.ADO_PROJECT,
          repositoryId: env.ADO_REPOSITORY_ID,
        });

        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        break;
      }
      case 6:
        await processQaVerification(workItemId, options);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        break;
      case 7:
        await processDeploymentWorkflow(workItemId, revId, options);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        break;
      default:
        stateStore.updateDedupStatus(
          workItemId,
          revId,
          'skipped',
          `Ticket state '${workItem.state}' has no active handler`
        );
        break;
    }
```

**Error handling pattern** (lines 162-175):
```typescript
  } catch (err: any) {
    stateStore.updateDedupStatus(
      workItemId,
      revId,
      'failed',
      err?.message || String(err)
    );
    console.error(
      `[router] Failed routing work item ${workItemId} rev ${revId}:`,
      err
    );
    throw err;
  }
```

---

### `tests/taxonomy.test.ts` (test, request-response)

**Analog:** `tests/verdict-detector.test.ts` (lines 1-103)

**Imports pattern**:
```typescript
import { describe, it, expect } from 'vitest';
import {
  GOLDEN_PATH_V2,
  resolveRoutingStep,
  getStepByNumber,
  getStepsByColumn,
  getStepsByAdoState,
} from '../src/pipeline/taxonomy.js';
```

**Taxonomy structure assertions pattern**:
```typescript
describe('Golden Path v2 Taxonomy Definition (TAX-01)', () => {
  it('defines exactly 9 steps covering all 5 columns and L1-L7 evidence levels', () => {
    expect(GOLDEN_PATH_V2).toHaveLength(9);

    const stepNumbers = GOLDEN_PATH_V2.map((s) => s.step);
    expect(stepNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const columns = new Set(GOLDEN_PATH_V2.map((s) => s.column));
    expect(columns).toEqual(
      new Set(['REFINEMENT', 'EXECUTION', 'ACCEPTANCE', 'RELEASE', 'RETRO'])
    );
  });

  it('guarantees immutability via Object.freeze', () => {
    expect(Object.isFrozen(GOLDEN_PATH_V2)).toBe(true);
    for (const step of GOLDEN_PATH_V2) {
      expect(Object.isFrozen(step)).toBe(true);
      expect(Object.isFrozen(step.evidenceLevels)).toBe(true);
    }
  });

  it('maps correct actor roles and evidence levels across all steps', () => {
    const step1 = getStepByNumber(1);
    expect(step1?.column).toBe('REFINEMENT');
    expect(step1?.actor).toBe('AI');
    expect(step1?.primaryEvidenceLevel).toBe('L1');
    expect(step1?.adoState).toBe('New');

    const step9 = getStepByNumber(9);
    expect(step9?.column).toBe('RETRO');
    expect(step9?.actor).toBe('AI');
    expect(step9?.primaryEvidenceLevel).toBe('L7');
    expect(step9?.adoState).toBe('Done');
  });
});

describe('Taxonomy Resolution Helpers (TAX-03)', () => {
  it('resolves routing steps by ADO state and tags', () => {
    expect(resolveRoutingStep('New')?.step).toBe(1);
    expect(resolveRoutingStep('Ready to Dev')?.step).toBe(2);
    expect(resolveRoutingStep('In Dev')?.step).toBe(3);
    expect(resolveRoutingStep('AnyState', ['[awaiting-input]'])?.step).toBe(3);
    expect(resolveRoutingStep('Dev Done')?.step).toBe(4);
    expect(resolveRoutingStep('Ready for QA')?.step).toBe(6);
    expect(resolveRoutingStep('Ready to Deploy')?.step).toBe(7);
    expect(resolveRoutingStep('Done')?.step).toBe(9);
    expect(resolveRoutingStep('UnknownState')).toBeUndefined();
  });

  it('filters steps by column and state', () => {
    expect(getStepsByColumn('REFINEMENT')).toHaveLength(2);
    expect(getStepsByColumn('EXECUTION')).toHaveLength(2);
    expect(getStepsByColumn('ACCEPTANCE')).toHaveLength(2);
    expect(getStepsByColumn('RELEASE')).toHaveLength(2);
    expect(getStepsByColumn('RETRO')).toHaveLength(1);

    expect(getStepsByAdoState('Dev Done')).toHaveLength(2); // Step 4 and Step 5
  });
});
```

---

### `tests/lifecycle-replay.test.ts` (test, request-response)

**Analog:** `tests/rework-integration.test.ts` (lines 1-52, 89-120) and `tests/worker.test.ts` (lines 1-86)

**Imports & harness setup pattern**:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { adoClient } from '../src/ado/client.js';
import { routeWorkItemEvent } from '../src/execute/router.js';

describe('V1 Lifecycle Replay Parity Test (TAX-03)', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    adoClient.setWorkItemTrackingApi(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
  });
```

**Lifecycle replay test sequence pattern**:
```typescript
  it('drives work item through full lifecycle New -> Ready to Dev -> In Dev -> Dev Done -> Ready for QA -> Ready to Deploy -> Done with exact v1.0 parity', async () => {
    const workItemId = 9001;

    // 1. New (Step 1 -> Audit)
    let revId = 1;
    const mockWitApi = {
      getWorkItem: vi.fn(),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    mockWitApi.getWorkItem.mockResolvedValueOnce({
      id: workItemId,
      rev: revId,
      fields: {
        'System.Title': 'Replay Test Feature',
        'System.Description': 'Description for feature verification.',
        'Microsoft.VSTS.Common.AcceptanceCriteria': 'Given input, return valid result.',
        'System.State': 'New',
      },
    });
    stateStore.recordDedupEvent(workItemId, revId, `hash-${revId}`);
    await routeWorkItemEvent(workItemId, revId);
    expect(stateStore.getDedupEvent(workItemId, revId)?.status).toBe('completed');

    // 2. Ready to Dev (Step 2 -> Skipped, human PM gate in v1.0)
    revId++;
    mockWitApi.getWorkItem.mockResolvedValueOnce({
      id: workItemId,
      rev: revId,
      fields: {
        'System.Title': 'Replay Test Feature',
        'System.State': 'Ready to Dev',
      },
    });
    stateStore.recordDedupEvent(workItemId, revId, `hash-${revId}`);
    await routeWorkItemEvent(workItemId, revId);
    const dedupStep2 = stateStore.getDedupEvent(workItemId, revId);
    expect(dedupStep2?.status).toBe('skipped');
    expect(dedupStep2?.errorMessage).toBe("Ticket state 'Ready to Dev' has no active handler");

    // 3. In Dev (Step 3 -> Execution Worker)
    // 4. Dev Done (Step 4 -> PR creation)
    // 5. [approve-acceptance] verdict -> completed
    // 6. Ready for QA (Step 6 -> QA Worker)
    // 7. Ready to Deploy (Step 7 -> Deploy Worker)
    // 8. Done (Step 9 -> Skipped)
  });
```

---

## Shared Patterns

### StateStore Test Harness & Cleanup
**Source:** `tests/worker.test.ts` lines 14-29; `tests/rework-integration.test.ts` lines 23-33
**Apply to:** All integration tests touching router, StateStore, or worker pipelines
```typescript
let harness: TestStateStoreContext;
const originalStateDir = env.STATE_STORE_DIR;

beforeEach(() => {
  harness = createTestStateStore();
  (env as any).STATE_STORE_DIR = harness.tempDir;
  resetStateStore();
  adoClient.setWorkItemTrackingApi(null);
});

afterEach(() => {
  harness.cleanup();
  (env as any).STATE_STORE_DIR = originalStateDir;
  resetStateStore();
});
```

### Dedup Status Reporting & Error Handling
**Source:** `src/execute/router.ts` lines 155-174
**Apply to:** Router dispatch and skipped state handling
```typescript
// Skipped unhandled states
stateStore.updateDedupStatus(
  workItemId,
  revId,
  'skipped',
  `Ticket state '${workItem.state}' has no active handler`
);

// Failed exceptions
catch (err: any) {
  stateStore.updateDedupStatus(
    workItemId,
    revId,
    'failed',
    err?.message || String(err)
  );
  throw err;
}
```

### Pure Immutability with Zero Dependencies
**Source:** `src/accept/verdict.ts` lines 1-52
**Apply to:** `src/pipeline/taxonomy.ts`
```typescript
// Deep Object.freeze on arrays and object literals
export const GOLDEN_PATH_V2 = Object.freeze([...]);
```

---

## No Analog Found

None. All files have direct codebase analogs.

---

## Metadata

**Analog search scope:** `src/`, `tests/`
**Files scanned:** 38
**Pattern extraction date:** 2026-09-17
