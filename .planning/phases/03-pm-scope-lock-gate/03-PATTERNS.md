# Phase 3: PM Scope-Lock Gate - Pattern Map

**Mapped:** 2026-09-17
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/state/types.ts` | model | transform | `src/state/types.ts` | exact |
| `src/scope/packet.ts` | component | transform | `src/accept/packet.ts` | exact |
| `src/scope/verdict.ts` | utility | request-response | `src/accept/verdict.ts` | exact |
| `src/scope/gate.ts` | service | event-driven | `src/accept/breaker.ts` | exact |
| `src/scope/watchdog.ts` | service | batch | `src/plan/watchdog.ts` | exact |
| `src/scope/index.ts` | utility | transform | `src/state/index.ts` | role-match |
| `src/auditor/worker.ts` | service | event-driven | `src/auditor/worker.ts` | exact |
| `src/execute/router.ts` | controller | request-response | `src/execute/router.ts` | exact |
| `src/ado/work-item.ts` | service | request-response | `src/ado/work-item.ts` | exact |
| `tests/scope-gate.test.ts` | test | request-response | `tests/rework-breaker.test.ts` | exact |
| `tests/worker.test.ts` | test | request-response | `tests/worker.test.ts` | exact |
| `tests/lifecycle-replay.test.ts` | test | request-response | `tests/lifecycle-replay.test.ts` | exact |

---

## Pattern Assignments

### `src/state/types.ts` (model, transform)

**Analog:** `src/state/types.ts` lines 48-55, 133-149

**Imports pattern:**
None required for pure interfaces.

**Core pattern (sub-state and parent ticket definition):**
```typescript
// lines 48-55: existing isolated breaker/cycle pattern
export interface ReworkCycleState {
  bounceCount: number;
  lastBounceAt?: string | null;
  sourceGate: 'accept' | 'pr_review';
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ScopeLockState to add following identical schema conventions
export interface ScopeLockState {
  status: 'pending' | 'locked' | 'rejected' | 'blocked';
  iterationCount: number;
  requestedAt: string;
  lockedAt?: string | null;
  lockedBy?: string | null;
  feedback?: string | null;
  remindedAt?: string | null;
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// lines 133-149: extend TicketState
export interface TicketState {
  workItemId: number;
  revId: number;
  createdAt: string;
  updatedAt: string;
  auditLogs: AuditLogEntry[];
  planCheckpoints: PlanCheckpointState[];
  l3Evidence: L3EvidenceEntry[];
  scopeLock?: ScopeLockState | null; // NEW: Phase 3 PM Scope-Lock Gate state
  reworkCycles?: ReworkCycleState | null;
  // ...
}
```

---

### `src/scope/packet.ts` (component, transform)

**Analog:** `src/accept/packet.ts` lines 1-100

**Imports pattern (lines 1-7):**
```typescript
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
```

**Core formatting pattern (lines 27-75):**
```typescript
export interface ScopePacketData {
  workItemId: number;
  title: string;
  criteriaSummary: string;
  reasons: string[];
}

export function formatScopeReviewPacketComment(data: ScopePacketData): string {
  const md = `### [Scope Review Packet] L1 Audit Contract Passed

| Metric | Result |
| :--- | :--- |
| **Status** | **AWAITING PM SCOPE LOCK** |
| **Audit Summary** | ${data.criteriaSummary} |

<details open>
<summary><strong>Scope Review Instructions & Definition of Done</strong></summary>

* **PM Action Required**:
  * To **Approve**: Move work item state to \`Ready to Dev\`, tag \`[scope-locked]\`, or reply \`[approve-scope]\`.
  * To **Request Changes**: Keep in \`New\` and reply \`[reject-scope] <feedback>\` or tag \`[scope-rejected]\`.
  * To **Reset Scope Counter**: Reply \`[reset-scope]\`.
</details>
`;

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
      'h3',
      'details',
      'summary',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}
```

**JSON Patch builder pattern (lines 77-99):**
```typescript
export function buildParkScopeLockPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[awaiting-scope-lock]; [audit-passed]'
  );
  return [
    ...tagPatches,
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}
```

---

### `src/scope/verdict.ts` (utility, request-response)

**Analog:** `src/accept/verdict.ts` lines 1-50

**Imports pattern (lines 1-5):**
```typescript
// Pure parser/detector, zero external runtime dependencies
```

**Core pattern (verdict detection & token parsing, lines 1-50):**
```typescript
export type ScopeVerdict =
  | { type: 'approve'; comment?: string; actor?: string }
  | { type: 'reject'; feedback: string; actor?: string }
  | { type: 'reset_scope' }
  | { type: 'none' };

export interface ScopeVerdictDetectionInput {
  currentState: string;
  previousState?: string;
  historyComment?: string;
  tags?: string;
  previousTags?: string;
  revisedBy?: string;
}

export function detectScopeVerdict(input: ScopeVerdictDetectionInput): ScopeVerdict {
  const comment = input.historyComment || '';

  if (comment.includes('[reset-scope]')) {
    return { type: 'reset_scope' };
  }

  // Approval condition:
  // 1. Explicit token [approve-scope]
  // 2. State transition New -> Ready to Dev
  // 3. Tag [scope-locked] added
  if (
    comment.includes('[approve-scope]') ||
    (input.previousState === 'New' && input.currentState === 'Ready to Dev') ||
    (input.tags?.includes('[scope-locked]') && !input.previousTags?.includes('[scope-locked]'))
  ) {
    return {
      type: 'approve',
      comment: comment || undefined,
      actor: input.revisedBy,
    };
  }

  // Rejection condition:
  // 1. Explicit token [reject-scope]
  // 2. Tag [scope-rejected] added
  if (
    comment.includes('[reject-scope]') ||
    (input.tags?.includes('[scope-rejected]') && !input.previousTags?.includes('[scope-rejected]'))
  ) {
    const feedback = comment
      .replace(/\[reject-scope\]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    return {
      type: 'reject',
      feedback:
        feedback ||
        'Scope review rejected by PM without specific comments. Please clarify requirements and scope boundaries.',
      actor: input.revisedBy,
    };
  }

  return { type: 'none' };
}
```

---

### `src/scope/gate.ts` (service, event-driven)

**Analog:** `src/accept/breaker.ts` lines 1-102

**Imports pattern (lines 1-7):**
```typescript
import { stateStore } from '../state/index.js';
import { workItemQueueManager, laneContext } from '../queue/lane-manager.js';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
```

**Core mutation and breaker pattern (lines 9-52):**
```typescript
export async function evaluateScopeBreaker(
  workItemId: number
): Promise<{ allowed: boolean; iterationCount: number }> {
  let allowed = true;
  let iterationCount = 1;

  const mutate = async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      const prev = draft.scopeLock?.iterationCount ?? 0;
      iterationCount = prev + 1;
      const now = new Date().toISOString();

      if (prev >= 2) {
        allowed = false;
        draft.scopeLock = {
          status: 'blocked',
          iterationCount,
          requestedAt: draft.scopeLock?.requestedAt ?? now,
          lockedAt: null,
          lockedBy: null,
          feedback: draft.scopeLock?.feedback ?? null,
          remindedAt: draft.scopeLock?.remindedAt ?? null,
          escalatedAt: draft.scopeLock?.escalatedAt ?? now,
          createdAt: draft.scopeLock?.createdAt ?? now,
          updatedAt: now,
        };
      } else {
        allowed = true;
        draft.scopeLock = {
          status: 'rejected',
          iterationCount,
          requestedAt: draft.scopeLock?.requestedAt ?? now,
          lockedAt: null,
          lockedBy: null,
          feedback: draft.scopeLock?.feedback ?? null,
          remindedAt: draft.scopeLock?.remindedAt ?? null,
          escalatedAt: null,
          createdAt: draft.scopeLock?.createdAt ?? now,
          updatedAt: now,
        };
      }
    });
  };

  if (laneContext.getStore()?.workItemId === workItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(workItemId, mutate);
  }

  return { allowed, iterationCount };
}
```

**Breaker reset and patch building pattern (lines 54-101):**
```typescript
export async function resetScopeBreaker(workItemId: number): Promise<void> {
  const mutate = async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      if (draft.scopeLock) {
        draft.scopeLock.iterationCount = 0;
        draft.scopeLock.escalatedAt = null;
        draft.scopeLock.updatedAt = new Date().toISOString();
      }
    });
  };

  if (laneContext.getStore()?.workItemId === workItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(workItemId, mutate);
  }
}

export function buildScopeEscalationPatch(
  workItemId: number,
  iterationCount: number,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[scope-unresolved]',
    '[awaiting-scope-lock]'
  );

  const commentHtml = `<h3>[Scope Escalated] Refinement Limit Exceeded</h3>
<p>Work item has reached <strong>${iterationCount} scope review rejections</strong>, exceeding the refinement policy limit (2).</p>
<p><strong>Action required:</strong> PM/Lead manual intervention required. To reset the scope gate after revising requirements, post <code>[reset-scope]</code>.</p>
<!-- [automated-agent] -->`;

  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: commentHtml,
    },
  ] as unknown as JsonPatchDocument;
}
```

---

### `src/scope/watchdog.ts` (service, batch)

**Analog:** `src/plan/watchdog.ts` lines 1-125

**Imports pattern (lines 1-5):**
```typescript
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { adoClient } from '../ado/client.js';
import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { buildTagPatch } from '../ado/work-item.js';
```

**Core batch timeout sweep & reconciliation pattern (lines 9-103):**
```typescript
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

export async function checkScopeLockTimeouts(): Promise<{
  reminded: number;
  escalated: number;
  reconciled: number;
}> {
  let reminded = 0;
  let escalated = 0;
  let reconciled = 0;

  const tickets = await stateStore.listTickets();

  for (const ticket of tickets) {
    if (ticket.scopeLock?.status !== 'pending') {
      continue;
    }

    try {
      // Reconcile with live ADO state in case webhook was dropped
      const workItem = await adoClient.getWorkItem(ticket.workItemId);
      const state = workItem.fields?.['System.State'];
      const tags = workItem.fields?.['System.Tags'] || '';

      if (state === 'Ready to Dev' || tags.includes('[scope-locked]')) {
        // Human already approved in ADO: reconcile StateStore
        await workItemQueueManager.runInLane(ticket.workItemId, async () => {
          await stateStore.updateTicketState(ticket.workItemId, (draft) => {
            if (draft.scopeLock && draft.scopeLock.status === 'pending') {
              draft.scopeLock.status = 'locked';
              draft.scopeLock.lockedAt = new Date().toISOString();
              draft.scopeLock.updatedAt = new Date().toISOString();
            }
          });
        });
        reconciled++;
        continue;
      }

      const requestedAt = new Date(ticket.scopeLock.requestedAt).getTime();
      const elapsed = Date.now() - requestedAt;

      if (elapsed >= SEVENTY_TWO_HOURS_MS && !ticket.scopeLock.escalatedAt) {
        const escalationComment =
          '<strong>[Scope Review Escalation] Work Item Blocked</strong><p>Scope review has been pending for over 72 hours without PM verdict. Marking work item Blocked.</p><!-- [automated-agent] -->';

        await workItemQueueManager.runInLane(ticket.workItemId, async () => {
          const current = await stateStore.getTicketState(ticket.workItemId);
          if (!current?.scopeLock || current.scopeLock.status !== 'pending' || current.scopeLock.escalatedAt) {
            return;
          }

          const tagPatches = buildTagPatch(tags, '[scope-unresolved]', '[awaiting-scope-lock]');
          await adoClient.updateWorkItem(ticket.workItemId, [
            ...tagPatches,
            {
              op: Operation.Replace,
              path: '/fields/System.State',
              value: 'Blocked',
            },
            {
              op: Operation.Add,
              path: '/fields/System.History',
              value: escalationComment,
            },
          ]);

          await stateStore.updateTicketState(ticket.workItemId, (draft) => {
            if (draft.scopeLock && draft.scopeLock.status === 'pending') {
              draft.scopeLock.status = 'blocked';
              draft.scopeLock.escalatedAt = new Date().toISOString();
              draft.scopeLock.updatedAt = new Date().toISOString();
            }
          });
          escalated++;
        });
      } else if (elapsed >= TWENTY_FOUR_HOURS_MS && !ticket.scopeLock.remindedAt) {
        const reminderComment =
          '<strong>[Scope Review Reminder] Action Required</strong><p>Work item is awaiting PM scope lock. Please review acceptance criteria and approve or request changes.</p><!-- [automated-agent] -->';

        await workItemQueueManager.runInLane(ticket.workItemId, async () => {
          const current = await stateStore.getTicketState(ticket.workItemId);
          if (!current?.scopeLock || current.scopeLock.status !== 'pending' || current.scopeLock.remindedAt) {
            return;
          }

          await adoClient.updateWorkItem(ticket.workItemId, [
            {
              op: Operation.Add,
              path: '/fields/System.History',
              value: reminderComment,
            },
          ]);

          await stateStore.updateTicketState(ticket.workItemId, (draft) => {
            if (draft.scopeLock && draft.scopeLock.status === 'pending') {
              draft.scopeLock.remindedAt = new Date().toISOString();
              draft.scopeLock.updatedAt = new Date().toISOString();
            }
          });
          reminded++;
        });
      }
    } catch (itemErr) {
      console.error(`[scope-watchdog] Error processing ticket ${ticket.workItemId}:`, itemErr);
    }
  }

  return { reminded, escalated, reconciled };
}
```

**Lifecycle timer pattern (lines 105-124):**
```typescript
export function startScopeWatchdog(
  intervalMs = 60 * 60 * 1000
): { stop: () => void } {
  let running = true;

  const timer = setInterval(async () => {
    if (!running) return;
    try {
      await checkScopeLockTimeouts();
    } catch (err) {
      console.error('[scope-watchdog] Error checking timeouts:', err);
    }
  }, intervalMs);

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}
```

---

### `src/scope/index.ts` (utility, transform)

**Analog:** `src/state/index.ts` lines 1-6

**Barrel exports pattern:**
```typescript
export * from './verdict.js';
export * from './packet.js';
export * from './gate.js';
export * from './watchdog.js';
```

---

### `src/auditor/worker.ts` (service, event-driven)

**Analog:** `src/auditor/worker.ts` lines 1-72

**Pre-LLM Idempotency & Bypass Guard pattern (lines 18-28):**
```typescript
// Insert before LLM audit execution
const ticketState = await stateStore.getTicketState(workItemId);
const isParkedAwaiting =
  workItem.tags?.includes('[awaiting-scope-lock]') ||
  ticketState?.scopeLock?.status === 'pending';
const isAlreadyLocked =
  workItem.tags?.includes('[scope-locked]') ||
  ticketState?.scopeLock?.status === 'locked';

if (isParkedAwaiting || isAlreadyLocked) {
  stateStore.updateDedupStatus(
    workItemId,
    revId,
    'skipped',
    `Work item ${workItemId} is parked awaiting scope lock or already locked; skipping re-audit`
  );
  return;
}
```

**Audit Pass Parking Replacement (lines 56-60):**
```typescript
// Replace transitionToReadyToDev with scope parking
if (result.passed) {
  const packetHtml = formatScopeReviewPacketComment({
    workItemId,
    title: workItem.title,
    criteriaSummary: result.criteria_summary,
    reasons: result.reasons,
  });

  const patchDoc = buildParkScopeLockPatch(packetHtml, workItem.tags);
  await adoClient.updateWorkItem(workItemId, patchDoc);

  await stateStore.updateTicketState(workItemId, (draft) => {
    const now = new Date().toISOString();
    draft.scopeLock = {
      status: 'pending',
      iterationCount: 0,
      requestedAt: now,
      lockedAt: null,
      lockedBy: null,
      feedback: null,
      remindedAt: null,
      escalatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  });
} else {
  await postFeedbackComment(workItemId, htmlComment);
}
```

---

### `src/execute/router.ts` (controller, request-response)

**Analog:** `src/execute/router.ts` lines 60-120

**Scope Verdict Dispatch pattern (lines 74-99):**
```typescript
// Detect scope verdict alongside acceptance verdict
const scopeVerdict = detectScopeVerdict({
  currentState: workItem.state,
  previousState,
  historyComment: workItem.history,
  tags: workItem.tags,
});

if (scopeVerdict.type === 'reset_scope') {
  await resetScopeBreaker(workItemId);
  stateStore.updateDedupStatus(workItemId, revId, 'completed');
  return;
} else if (scopeVerdict.type === 'approve') {
  await handleScopeApproval(workItemId, workItem.tags);
  stateStore.updateDedupStatus(workItemId, revId, 'completed');
  return;
} else if (scopeVerdict.type === 'reject') {
  const breaker = await evaluateScopeBreaker(workItemId);
  if (!breaker.allowed) {
    await escalateScopeToBlocked(workItemId, breaker.iterationCount);
  } else {
    await postFeedbackComment(workItemId, scopeVerdict.feedback);
  }
  stateStore.updateDedupStatus(workItemId, revId, 'completed');
  return;
}
```

**Step 3 In Dev Scope Guard pattern (lines 116-118):**
```typescript
case 3: {
  const ticket = await stateStore.getTicketState(workItemId);
  if (ticket?.scopeLock?.status !== 'locked' && !options?.skipScopeLockCheck) {
    stateStore.updateDedupStatus(
      workItemId,
      revId,
      'skipped',
      `In Dev dispatch refused: ticket is not scope-locked (status: ${ticket?.scopeLock?.status ?? 'none'})`
    );
    return;
  }
  await processWorkItemExecute(workItemId, revId, options);
  break;
}
```

---

### `src/ado/work-item.ts` (service, request-response)

**Analog:** `src/ado/work-item.ts` lines 27-55, 87-110, 210-217

**JSON Patch and update helper patterns:**
```typescript
export function buildScopeApprovedPatch(
  htmlComment?: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[scope-locked]',
    '[awaiting-scope-lock]'
  );
  const patch: any[] = [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Ready to Dev',
    },
  ];
  if (htmlComment) {
    patch.push({
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    });
  }
  return patch as unknown as JsonPatchDocument;
}
```

---

### `tests/scope-gate.test.ts` (test, request-response)

**Analog:** `tests/rework-breaker.test.ts` lines 1-27, 28-45 & `tests/verdict-detector.test.ts` lines 1-48

**Test structure pattern:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { adoClient } from '../src/ado/client.js';
import { detectScopeVerdict } from '../src/scope/verdict.js';
import { evaluateScopeBreaker, resetScopeBreaker } from '../src/scope/gate.js';
import { checkScopeLockTimeouts } from '../src/scope/watchdog.js';

describe('PM Scope-Lock Gate (Phase 3)', () => {
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

  it('SCOPE-01: parks ticket in New + [awaiting-scope-lock] on audit pass', async () => {
    // ...
  });

  it('SCOPE-02: detects verdict on state transition and comment tokens', async () => {
    // ...
  });

  it('SCOPE-03: refuses In Dev dispatch when ticket is not scope-locked', async () => {
    // ...
  });
});
```

---

### `tests/worker.test.ts` (test, request-response)

**Analog:** `tests/worker.test.ts` lines 56-70

**Modified assertion pattern (Case 1):**
```typescript
// Replace Ready to Dev assertion with New + [awaiting-scope-lock]
const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
expect(tagOp.value).toContain('[awaiting-scope-lock]');
expect(tagOp.value).toContain('[audit-passed]');

// State remains New (no Replace on System.State)
const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
expect(stateOp).toBeUndefined();
```

---

### `tests/lifecycle-replay.test.ts` (test, request-response)

**Analog:** `tests/lifecycle-replay.test.ts` lines 90-115

**Modified lifecycle flow pattern:**
```typescript
// Rev 2 is parked in New with [awaiting-scope-lock]
// Rev 2b or intermediate transition unlocks with [scope-locked] -> Ready to Dev
// Rev 3 transitions to In Dev with scopeLock.status === 'locked'
```

---

## Shared Patterns

### Bot Echo Marker & HTML Sanitization
**Source:** `src/accept/packet.ts` lines 58-74
**Apply to:** `src/scope/packet.ts`, `src/scope/gate.ts`, `src/scope/watchdog.ts`
```typescript
const sanitized = sanitizeHtml(rawHtml, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'h1', 'h2', 'h3', 'details', 'summary', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
  },
});
return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
```

### Tag List Manipulation
**Source:** `src/ado/work-item.ts` lines 27-55
**Apply to:** All ADO patch builders in `src/scope/packet.ts`, `src/scope/gate.ts`, `src/ado/work-item.ts`
```typescript
const tagPatches = buildTagPatch(currentTags, tagToAdd, tagToRemove);
```

### Concurrency & Single-Writer Lane Serialization
**Source:** `src/accept/breaker.ts` lines 45-49
**Apply to:** `src/scope/gate.ts`, `src/scope/watchdog.ts`
```typescript
if (laneContext.getStore()?.workItemId === workItemId) {
  await mutate();
} else {
  await workItemQueueManager.runInLane(workItemId, mutate);
}
```

### Deduplication Status Tracking
**Source:** `src/auditor/worker.ts` lines 20-26, 62-64
**Apply to:** `src/auditor/worker.ts`, `src/execute/router.ts`
```typescript
stateStore.updateDedupStatus(workItemId, revId, 'skipped', reason);
stateStore.updateDedupStatus(workItemId, revId, 'completed');
```

---

## No Analog Found

None. All files have direct codebase analogs matching role and data flow.

---

## Metadata

**Analog search scope:** `src/accept/`, `src/auditor/`, `src/execute/`, `src/plan/`, `src/ado/`, `src/state/`, `tests/`
**Files scanned:** 12
**Pattern extraction date:** 2026-09-17
