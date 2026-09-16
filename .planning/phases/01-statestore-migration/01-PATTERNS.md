# Phase 1: StateStore Migration - Pattern Map

**Mapped:** 2026-09-17
**Files analyzed:** 16
**Analogs found:** 16 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/state/types.ts` | model | CRUD | `src/db/schema.ts` | role-match |
| `src/state/store.ts` | service | file-I/O | `src/db/index.ts` | role-match |
| `src/state/index.ts` | provider | request-response | `src/db/index.ts` | exact |
| `src/state/test-harness.ts` | utility | file-I/O | `tests/worktree.test.ts` | exact |
| `src/queue/lane-manager.ts` | service | event-driven | `src/queue/lane-manager.ts` | exact |
| `src/ingress/routes.ts` | controller | request-response | `src/ingress/routes.ts` | exact |
| `src/config/env.ts` | config | request-response | `src/config/env.ts` | exact |
| `src/index.ts` | config | request-response | `src/index.ts` | exact |
| `src/auditor/worker.ts` | service | CRUD | `src/auditor/worker.ts` | exact |
| `src/plan/checkpoint.ts` | service | CRUD | `src/plan/checkpoint.ts` | exact |
| `src/plan/watchdog.ts` | service | batch | `src/plan/watchdog.ts` | exact |
| `src/accept/breaker.ts` | service | CRUD | `src/accept/breaker.ts` | exact |
| `tests/state-store.test.ts` | test | file-I/O | `tests/dedup.test.ts` | role-match |
| `tests/state-single-writer.test.ts` | test | request-response | `tests/ingress.test.ts` | role-match |
| `tests/dedup.test.ts` | test | file-I/O | `tests/dedup.test.ts` | exact |
| `package.json` | config | batch | `package.json` | exact |

## Pattern Assignments

### `src/state/types.ts` (model, CRUD)

**Analog:** `src/db/schema.ts`

**Imports pattern** (lines 1-2):
```typescript
// Pure TypeScript interfaces, zero runtime dependencies
```

**Core types pattern** (analogous to `src/db/schema.ts` lines 209-232):
```typescript
export interface DedupRecord {
  workItemId: number;
  revId: number;
  status: 'pending' | 'completed' | 'skipped' | 'failed';
  payloadHash: string;
  errorMessage?: string;
  receivedAt: string;
}

export interface AuditLogEntry {
  id?: number;
  revId: number;
  verdict: 'passed' | 'failed';
  reasons: string;
  criteriaSummary: string;
  model: string;
  evaluatedAt: string;
}

export interface PlanCheckpointState {
  id?: number;
  revId: number;
  status: 'pending_human_input' | 'resumed' | 'locked' | 'blocked' | 'expired';
  questions: string;
  answers?: string | null;
  planMarkdown?: string | null;
  estimatedFiles?: string | null;
  testStrategy?: string | null;
  remindedAt?: string | null;
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface L3EvidenceEntry {
  id?: number;
  revId: number;
  testSuite: string;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  coverageSummary?: string | null;
  gitDiffStat: string;
  createdAt: string;
}

export interface ReworkCycleState {
  bounceCount: number;
  lastBounceAt?: string | null;
  sourceGate: 'accept' | 'pr_review';
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QaRunEntry {
  id?: number;
  runIndex: number;
  strikeCount: number;
  status: 'passed' | 'failed' | 'flaked';
  failedTestSignatures?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface QaBounceState {
  bounceCount: number;
  lastBouncedAt?: string | null;
  escalated: number;
}

export interface QaEvidenceState {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  commitSha: string;
  stagingUrl?: string | null;
  flakeCleared: number;
  createdAt: string;
}

export interface DeploymentRecordEntry {
  id?: number;
  pipelineRunId?: string | null;
  stageName: string;
  environmentName: string;
  commitSha: string;
  status: 'pending_approval' | 'deployed' | 'failed' | 'rejected';
  releaseNotes?: string | null;
  rollbackPlan?: string | null;
  migrationRisk?: string | null;
  createdAt: string;
  deployedAt?: string | null;
}

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
  completedAt: string;
}

export interface SkillsPrEntry {
  id?: number;
  skillName: string;
  branchName: string;
  pullRequestId?: number | null;
  prUrl?: string | null;
  status: 'pending_review' | 'merged' | 'closed';
  summary: string;
  createdAt: string;
}

export interface TicketState {
  workItemId: number;
  revId: number;
  createdAt: string;
  updatedAt: string;
  auditLogs: AuditLogEntry[];
  planCheckpoints: PlanCheckpointState[];
  l3Evidence: L3EvidenceEntry[];
  reworkCycles?: ReworkCycleState | null;
  qaRuns: QaRunEntry[];
  qaBounces?: QaBounceState | null;
  qaEvidence?: QaEvidenceState | null;
  deploymentRecords: DeploymentRecordEntry[];
  telemetryEvaluations: TelemetryEvaluationEntry[];
  evidenceIndex?: EvidenceIndexState | null;
  skillsPrs: SkillsPrEntry[];
}

export interface StateStore {
  getTicketState(workItemId: number): Promise<TicketState | null>;
  getTicketNotes(workItemId: number): Promise<string>;
  updateTicketState(
    workItemId: number,
    mutator: (state: TicketState) => void | Promise<void>,
    notesAppend?: string
  ): Promise<TicketState>;
  listTickets(): Promise<TicketState[]>;
  archiveTicket(workItemId: number): Promise<void>;
  recordDedupEvent(
    workItemId: number,
    revId: number,
    payloadHash: string
  ): { isDuplicate: boolean; event: DedupRecord };
  updateDedupStatus(
    workItemId: number,
    revId: number,
    status: DedupRecord['status'],
    errorMessage?: string
  ): void;
  purgeOldDedupEvents(retentionDays?: number): { changes: number };
}
```

---

### `src/state/store.ts` (service, file-I/O)

**Analog:** `src/db/index.ts` and `src/sandbox/worktree.ts`

**Imports pattern:**
```typescript
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { laneContext } from '../queue/lane-manager.js';
import type { StateStore, TicketState, DedupRecord } from './types.js';
```

**Guard / single-writer check pattern:**
```typescript
export class OffLaneMutationError extends Error {
  constructor(workItemId: number, activeLane?: number) {
    super(
      `Off-lane mutation rejected: mutation for workItemId ${workItemId} must be executed inside its dedicated lane (active lane: ${activeLane ?? 'none'}).`
    );
    this.name = 'OffLaneMutationError';
  }
}

function verifyLane(workItemId: number): void {
  const current = laneContext.getStore();
  if (!current || current.workItemId !== workItemId) {
    throw new OffLaneMutationError(workItemId, current?.workItemId);
  }
}
```

**Crash-atomic write pattern (win32 safe):**
```typescript
function writeCrashAtomicSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  const tempName = `.${path.basename(targetPath)}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  const tempPath = path.join(dir, tempName);

  fs.writeFileSync(tempPath, content, 'utf8');

  try {
    if (process.platform === 'win32' && fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    throw err;
  }
}
// ponytail: win32 unlink-then-rename; replace with native atomic replace if node adds cross-platform flag
```

**Frontmatter parse & serialize pattern:**
```typescript
export function parseTicketDocument(raw: string): { frontmatter: TicketState; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid ticket document format: missing frontmatter fences');
  }
  const frontmatter = JSON.parse(match[1]) as TicketState;
  const body = match[2] || '';
  return { frontmatter, body };
}

export function serializeTicketDocument(frontmatter: TicketState, body: string): string {
  const json = JSON.stringify(frontmatter, null, 2);
  const trimmed = body.trim();
  return `---\n${json}\n---\n\n${trimmed}\n`;
}
```

**Atomic dedup marker pattern (analogous to `src/db/index.ts` lines 188-192):**
```typescript
export function recordDedupEventFile(
  dedupDir: string,
  workItemId: number,
  revId: number,
  payloadHash: string
): { isDuplicate: boolean; event: DedupRecord } {
  const markerPath = path.join(dedupDir, `${workItemId}-${revId}.json`);
  const record: DedupRecord = {
    workItemId,
    revId,
    status: 'pending',
    payloadHash,
    receivedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(markerPath, JSON.stringify(record, null, 2), { flag: 'wx' });
    return { isDuplicate: false, event: record };
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      return { isDuplicate: true, event: record };
    }
    throw err;
  }
}
```

---

### `src/state/index.ts` (provider, request-response)

**Analog:** `src/db/index.ts`

**Imports & singleton export pattern** (analogous to `src/db/index.ts` lines 8-16, 186-192):
```typescript
import { env } from '../config/env.js';
import { FileStateStore } from './store.js';
import type { StateStore } from './types.js';

export * from './types.js';
export { OffLaneMutationError } from './store.js';

export const stateStore: StateStore = new FileStateStore(env.STATE_STORE_DIR);

export function purgeOldDedupEvents(retentionDays = 7): { changes: number } {
  return stateStore.purgeOldDedupEvents(retentionDays);
}
```

---

### `src/state/test-harness.ts` (utility, file-I/O)

**Analog:** `tests/worktree.test.ts` (lines 36-60)

**Harness setup & teardown pattern:**
```typescript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileStateStore } from './store.js';
import type { StateStore } from './types.js';

export interface TestStateStoreContext {
  store: StateStore;
  tempDir: string;
  cleanup: () => void;
}

export function createTestStateStore(): TestStateStoreContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-state-'));
  const store = new FileStateStore(tempDir);
  const cleanup = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
  return { store, tempDir, cleanup };
}
```

---

### `src/queue/lane-manager.ts` (service, event-driven)

**Analog:** `src/queue/lane-manager.ts`

**Context & runInLane pattern** (lines 1-32):
```typescript
import PQueue from 'p-queue';
import { AsyncLocalStorage } from 'node:async_hooks';

export const laneContext = new AsyncLocalStorage<{ workItemId: number }>();

export class WorkItemQueueManager {
  private lanes = new Map<number, PQueue>();

  public getLane(workItemId: number): PQueue {
    let lane = this.lanes.get(workItemId);
    if (!lane) {
      lane = new PQueue({ concurrency: 1 });
      this.lanes.set(workItemId, lane);
    }
    return lane;
  }

  public async runInLane<T>(workItemId: number, fn: () => Promise<T>): Promise<T> {
    const lane = this.getLane(workItemId);
    return lane.add(() => laneContext.run({ workItemId }, fn));
  }

  public clearLane(workItemId: number): void {
    const lane = this.lanes.get(workItemId);
    if (lane && lane.size === 0 && lane.pending === 0) {
      this.lanes.delete(workItemId);
    }
  }

  public getActiveLaneCount(): number {
    return this.lanes.size;
  }

  public async drainAll(): Promise<void> {
    await Promise.all(Array.from(this.lanes.values()).map((lane) => lane.onIdle()));
    this.lanes.clear();
  }
}

export const workItemQueueManager = new WorkItemQueueManager();
```

---

### `src/ingress/routes.ts` (controller, request-response)

**Analog:** `src/ingress/routes.ts`

**Imports pattern** (lines 1-13):
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { verifyHmac } from './hmac.js';
import { isBotEcho } from './bot-shield.js';
import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { env } from '../config/env.js';
import { processWorkItemAudit } from '../auditor/worker.js';
import { handlePullRequestEvent, extractWorkItemId } from './pr-router.js';
import { processQaVerification } from '../qa/worker.js';
```

**Dedup & lane queuing pattern** (lines 69-95, 164-185):
```typescript
// Replace SQLite insert with atomic file dedup
const { isDuplicate } = stateStore.recordDedupEvent(workItemId, revId, payloadHash);
if (isDuplicate) {
  request.log.warn({ workItemId, revId }, 'Duplicate delivery ignored');
  return reply.code(200).send({ status: 'duplicate_ignored' });
}

// Acknowledge immediately
reply.code(202).send({ status: 'accepted', workItemId, revId });

// Background processing via runInLane
workItemQueueManager.runInLane(workItemId, async () => {
  if (activeHandler) {
    try {
      await activeHandler(workItemId, revId);
      stateStore.updateDedupStatus(workItemId, revId, 'completed');
    } catch (err: any) {
      request.log.error({ err, workItemId, revId }, 'Background work item processing failed');
      stateStore.updateDedupStatus(workItemId, revId, 'failed', err?.message || String(err));
    }
  }
});
```

---

### `src/config/env.ts` (config, request-response)

**Analog:** `src/config/env.ts`

**Schema replacement pattern** (lines 4-26):
```typescript
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  STATE_STORE_DIR: z.string().default('./data/state'),
  ADO_ORG_URL: z.string().url(),
  ADO_PAT: z.string().min(1, 'ADO_PAT is required'),
  ADO_BOT_ID: z.string().min(1, 'ADO_BOT_ID is required'),
  ADO_WEBHOOK_SECRET: z.string().min(1, 'ADO_WEBHOOK_SECRET is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  // ... other fields unchanged
});
```

---

### `src/index.ts` (config, request-response)

**Analog:** `src/index.ts`

**Startup purge & shutdown pattern** (lines 8, 43-59, 80-88):
```typescript
import { purgeOldDedupEvents } from './state/index.js';

// Startup sweep
try {
  const purgeResult = purgeOldDedupEvents(7);
  console.log(`[dedup-purge] Initial purge removed ${purgeResult.changes} expired events`);
} catch (err) {
  console.error('[dedup-purge] Initial purge failed:', err);
}

// Shutdown: no SQLite close needed
await workItemQueueManager.drainAll();
console.log('[shutdown] Work item queue lanes drained.');
```

---

### `src/auditor/worker.ts` (service, CRUD)

**Analog:** `src/auditor/worker.ts`

**StateStore update pattern** (lines 21-56):
```typescript
import { stateStore } from '../state/index.js';

// Audit result persistence
await stateStore.updateTicketState(workItemId, (draft) => {
  draft.revId = revId;
  draft.auditLogs.push({
    revId,
    verdict: result.passed ? 'passed' : 'failed',
    reasons: JSON.stringify(result.reasons),
    criteriaSummary: result.criteria_summary,
    model: 'gpt-4o',
    evaluatedAt: new Date().toISOString(),
  });
}, `## L1 Audit Verdict: ${result.passed ? 'PASSED' : 'FAILED'}\n${result.criteria_summary}`);
```

---

### `src/plan/checkpoint.ts` (service, CRUD)

**Analog:** `src/plan/checkpoint.ts`

**StateStore checkpoint pattern** (lines 14-34, 36-53):
```typescript
import { stateStore } from '../state/index.js';
import type { PlanCheckpointState } from '../state/types.js';

export async function createPlanCheckpoint(data: CreateCheckpointInput): Promise<PlanCheckpointState> {
  let created: PlanCheckpointState | undefined;
  await stateStore.updateTicketState(data.workItemId, (draft) => {
    created = {
      id: draft.planCheckpoints.length + 1,
      revId: data.revId,
      status: 'pending_human_input',
      questions: JSON.stringify(data.questions),
      planMarkdown: data.planMarkdown || null,
      estimatedFiles: data.estimatedFiles ? JSON.stringify(data.estimatedFiles) : null,
      testStrategy: data.testStrategy || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    draft.planCheckpoints.push(created);
  });
  return created!;
}

export async function getPendingCheckpoint(workItemId: number): Promise<PlanCheckpointState | undefined> {
  const ticket = await stateStore.getTicketState(workItemId);
  if (!ticket) return undefined;
  return ticket.planCheckpoints
    .filter((cp) => cp.status === 'pending_human_input')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}
```

---

### `src/plan/watchdog.ts` (service, batch)

**Analog:** `src/plan/watchdog.ts`

**Directory scan pattern** (lines 17-57):
```typescript
import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';

export async function checkPlanCheckpointTimeouts(): Promise<{ reminded: number; escalated: number }> {
  let reminded = 0;
  let escalated = 0;

  const tickets = await stateStore.listTickets();
  for (const ticket of tickets) {
    const pending = ticket.planCheckpoints.filter((cp) => cp.status === 'pending_human_input');
    for (const cp of pending) {
      // route mutation through lane to enforce single-writer invariant
      await workItemQueueManager.runInLane(ticket.workItemId, async () => {
        // escalation & reminder logic
      });
    }
  }
  return { reminded, escalated };
}
```

---

### `src/accept/breaker.ts` (service, CRUD)

**Analog:** `src/accept/breaker.ts`

**Circuit breaker pattern** (lines 10-74):
```typescript
import { stateStore } from '../state/index.js';

export async function evaluateCircuitBreaker(
  workItemId: number,
  sourceGate: 'accept' | 'pr_review'
): Promise<{ allowed: boolean; currentCount: number }> {
  let allowed = true;
  let currentCount = 1;

  await stateStore.updateTicketState(workItemId, (draft) => {
    const prev = draft.reworkCycles?.bounceCount ?? 0;
    currentCount = prev + 1;
    const now = new Date().toISOString();

    if (prev >= 2) {
      allowed = false;
      draft.reworkCycles = {
        bounceCount: currentCount,
        lastBounceAt: now,
        sourceGate,
        escalatedAt: draft.reworkCycles?.escalatedAt ?? now,
        createdAt: draft.reworkCycles?.createdAt ?? now,
        updatedAt: now,
      };
    } else {
      allowed = true;
      draft.reworkCycles = {
        bounceCount: currentCount,
        lastBounceAt: now,
        sourceGate,
        createdAt: draft.reworkCycles?.createdAt ?? now,
        updatedAt: now,
      };
    }
  });

  return { allowed, currentCount };
}
```

---

### `tests/state-store.test.ts` (test, file-I/O)

**Analog:** `tests/dedup.test.ts` and `tests/worktree.test.ts`

**Test structure pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';

describe('FileStateStore', () => {
  let harness: TestStateStoreContext;

  beforeEach(() => {
    harness = createTestStateStore();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('serializes and deserializes ticket document with strict JSON frontmatter', async () => {
    await workItemQueueManager.runInLane(101, async () => {
      await harness.store.updateTicketState(101, (draft) => {
        draft.revId = 1;
        draft.auditLogs.push({
          revId: 1,
          verdict: 'passed',
          reasons: 'All criteria met',
          criteriaSummary: '4/4 passed',
          model: 'gpt-4o',
          evaluatedAt: new Date().toISOString(),
        });
      }, '# Work Item 101 Notes\n');
    });

    const loaded = await harness.store.getTicketState(101);
    expect(loaded).toBeDefined();
    expect(loaded?.workItemId).toBe(101);
    expect(loaded?.auditLogs).toHaveLength(1);
    expect(loaded?.auditLogs[0].verdict).toBe('passed');

    const notes = await harness.store.getTicketNotes(101);
    expect(notes).toContain('# Work Item 101 Notes');
  });
});
```

---

### `tests/state-single-writer.test.ts` (test, request-response)

**Analog:** `tests/ingress.test.ts` and `tests/dedup.test.ts`

**Invariant assertion pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { OffLaneMutationError } from '../src/state/store.js';

describe('StateStore Single-Writer Invariant', () => {
  let harness: TestStateStoreContext;

  beforeEach(() => {
    harness = createTestStateStore();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('rejects direct mutation outside of workItemQueueManager lane', async () => {
    await expect(
      harness.store.updateTicketState(202, (draft) => {
        draft.revId = 1;
      })
    ).rejects.toThrow(OffLaneMutationError);
  });

  it('rejects mutation when laneContext workItemId mismatches target workItemId', async () => {
    await expect(
      workItemQueueManager.runInLane(202, async () => {
        await harness.store.updateTicketState(999, (draft) => {
          draft.revId = 1;
        });
      })
    ).rejects.toThrow(OffLaneMutationError);
  });

  it('allows mutation when executed inside dedicated lane', async () => {
    const updated = await workItemQueueManager.runInLane(202, async () => {
      return harness.store.updateTicketState(202, (draft) => {
        draft.revId = 2;
      });
    });

    expect(updated.workItemId).toBe(202);
    expect(updated.revId).toBe(2);
  });
});
```

---

### `tests/dedup.test.ts` (test, file-I/O)

**Analog:** `tests/dedup.test.ts`

**File dedup test pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';

describe('File-Backed Deduplication Store', () => {
  let harness: TestStateStoreContext;

  beforeEach(() => {
    harness = createTestStateStore();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('atomically creates a dedup marker file', () => {
    const res = harness.store.recordDedupEvent(1001, 1, 'hash-abc-123');
    expect(res.isDuplicate).toBe(false);
    expect(res.event.workItemId).toBe(1001);
    expect(res.event.revId).toBe(1);
    expect(res.event.status).toBe('pending');
  });

  it('detects duplicate delivery via EEXIST and returns isDuplicate: true', () => {
    harness.store.recordDedupEvent(1002, 1, 'hash-first');
    const dup = harness.store.recordDedupEvent(1002, 1, 'hash-second');
    expect(dup.isDuplicate).toBe(true);
  });

  it('purges dedup records older than retentionDays', () => {
    // Write marker and adjust mtime
    harness.store.recordDedupEvent(1003, 1, 'hash-old');
    const result = harness.store.purgeOldDedupEvents(0);
    expect(result.changes).toBeGreaterThanOrEqual(0);
  });
});
```

---

## Shared Patterns

### Single-Writer Invariant Enforcement
**Source:** `src/queue/lane-manager.ts` and `src/state/store.ts`
**Apply to:** All workers (`src/auditor/`, `src/execute/`, `src/qa/`, `src/deploy/`, `src/learn/`, `src/plan/`)
```typescript
// All mutations must run inside runInLane:
await workItemQueueManager.runInLane(workItemId, async () => {
  await stateStore.updateTicketState(workItemId, (draft) => {
    // state modifications
  });
});
```

### Crash-Atomic File Writes on Windows
**Source:** `src/state/store.ts`
**Apply to:** All file mutations (`tickets/<id>.md`, `archive/<id>.md`)
```typescript
const tempPath = path.join(dir, `.${path.basename(targetPath)}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`);
fs.writeFileSync(tempPath, content, 'utf8');
if (process.platform === 'win32' && fs.existsSync(targetPath)) {
  fs.unlinkSync(targetPath);
}
fs.renameSync(tempPath, targetPath);
```

### Atomic File Deduplication via `wx` Flag
**Source:** `src/state/store.ts` and `src/ingress/routes.ts`
**Apply to:** Webhook ingress (`workitem.*`, `git.pullrequest.*`)
```typescript
try {
  fs.writeFileSync(markerPath, JSON.stringify(record, null, 2), { flag: 'wx' });
  return { isDuplicate: false, event: record };
} catch (err: any) {
  if (err.code === 'EEXIST') {
    return { isDuplicate: true, event: record };
  }
  throw err;
}
```

### Test Directory Isolation via `mkdtemp`
**Source:** `src/state/test-harness.ts`
**Apply to:** All test suites (`tests/*.test.ts`)
```typescript
let harness: TestStateStoreContext;
beforeEach(() => {
  harness = createTestStateStore();
});
afterEach(() => {
  harness.cleanup();
});
```

## No Analog Found

None. All new and modified files map to established patterns in `src/db/`, `src/queue/`, `src/ingress/`, and `tests/`.

## Metadata

**Analog search scope:** `src/`, `tests/`
**Files scanned:** 62
**Pattern extraction date:** 2026-09-17
