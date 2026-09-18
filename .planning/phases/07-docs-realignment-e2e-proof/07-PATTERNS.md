# Phase 07: Docs Realignment & E2E Proof - Pattern Map

**Mapped:** 2026-09-18  
**Files analyzed:** 6 (2 new test files, 4 modified documentation/config files)  
**Analogs found:** 6 / 6 (100% codebase analog match)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tests/e2e-v2-golden-path.test.ts` | test | request-response | `tests/lifecycle-replay.test.ts` | exact |
| `tests/state-matrix-sync.test.ts` | test | file-I/O | `tests/taxonomy.test.ts` | exact |
| `CLAUDE.md` | config | transform | `CLAUDE.md` | exact |
| `.planning/PROJECT.md` | config | transform | `.planning/PROJECT.md` | exact |
| `.planning/REQUIREMENTS.md` | config | transform | `.planning/REQUIREMENTS.md` | exact |
| `.planning/ROADMAP.md` | config | transform | `.planning/ROADMAP.md` | exact |

---

## Pattern Assignments

### `tests/e2e-v2-golden-path.test.ts` (test, request-response)

**Analog:** `tests/lifecycle-replay.test.ts` (multi-step routing across revisions) & `tests/deploy-orchestrator.test.ts` (evidence accumulation, fail-closed verification, archiving)

**Imports pattern** (copy from `tests/lifecycle-replay.test.ts` lines 1–14 & `tests/deploy-orchestrator.test.ts` lines 1–20):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { adoClient } from '../src/ado/client.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { recordL3Evidence } from '../src/test-runner/evidence.js';
import { compileL1L7EvidenceIndex } from '../src/deploy/evidence-index.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
```

**Harness Setup & Teardown pattern** (copy from `tests/lifecycle-replay.test.ts` lines 48–72):
```typescript
describe('Golden Path v2 End-to-End Simulation (TAX-02)', () => {
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

**Step Progression & Mock Wit API pattern** (adapted from `tests/lifecycle-replay.test.ts` lines 74–195):
```typescript
  it('drives fixture ticket through all 9 steps accumulating non-null L1-L7 evidence', async () => {
    const workItemId = 9901;
    let currentRev = 1;

    const revisions: Record<number, any> = {
      1: {
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'New',
          'System.Tags': 'backend',
        },
      },
      2: {
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.State': 'Ready to Dev',
          'System.Tags': 'backend; [scope-locked]',
          'System.History': 'Scope verified and locked by PM [approve-scope]',
        },
      },
      3: {
        id: workItemId,
        rev: 3,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.State': 'In Dev',
          'System.Tags': 'backend; [scope-locked]',
        },
      },
      4: {
        id: workItemId,
        rev: 4,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.State': 'Dev Done',
          'System.Tags': 'backend; [awaiting-acceptance]',
        },
      },
      5: {
        id: workItemId,
        rev: 5,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.State': 'Dev Done',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'System.History': 'Developer completed review [approve-acceptance]',
        },
      },
      6: {
        id: workItemId,
        rev: 6,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.State': 'Ready for QA',
          'System.Tags': 'backend; [acceptance-approved]; [pr-merged]',
        },
      },
      7: {
        id: workItemId,
        rev: 7,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.State': 'Ready to Deploy',
          'System.Tags': 'backend; [qa-verified]',
        },
      },
      8: {
        id: workItemId,
        rev: 8,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.State': 'Ready to Deploy',
          'System.Tags': 'backend; [qa-verified]; [deploying]',
        },
      },
      9: {
        id: workItemId,
        rev: 9,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.State': 'Done',
          'System.Tags': 'backend; [golden-path-complete]',
        },
      },
    };

    const mockWitApi = {
      getWorkItem: vi.fn().mockImplementation((id: number) => {
        return Promise.resolve(revisions[currentRev] || revisions[1]);
      }),
      getRevision: vi.fn().mockImplementation((id: number, rev: number) => {
        return Promise.resolve(revisions[rev] || revisions[1]);
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);
```

**Real Evidence Persistence in Execution Step (Pitfall 1 prevention)** (adapted from `src/test-runner/evidence.ts` lines 24–42):
```typescript
    // Step 3 Execution writes real L3 evidence so downstream L1-L7 fail-closed checks pass
    await recordL3Evidence({
      workItemId,
      revId: 3,
      testSuite: 'vitest',
      totalTests: 8,
      passed: 8,
      failed: 0,
      durationMs: 350,
      gitDiffStat: '2 files changed, 50 insertions(+)',
      coverageSummary: '92%',
    });
```

**Deployment & Retro Options Configuration** (copy from `tests/deploy-orchestrator.test.ts` lines 576–596 & 989–1011):
```typescript
    const defaultMockRetro = {
      takeaways: 'Deployment verified and stable across all release gates',
      actionItems: [
        {
          action: 'Observe post-deploy telemetry',
          owner: 'Platform Team',
          priority: 'P2' as const,
          trackingRef: 'AB#9901',
        },
      ],
      gateFriction: { scopeRejections: 0, reworkBounces: 0, qaStrikes: 0, smokeFlakes: 0 },
      trendDeltas: {
        leadTimeMinutes: 25,
        leadTimeDeltaMinutes: 0,
        reworkBounces: 0,
        reworkDelta: 0,
        historicalDeployedCount: 1,
        trend: 'stable' as const,
      },
    };

    const mockPrCreator = vi.fn().mockResolvedValue({
      pullRequestId: 995,
      url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/995',
    });

    const deployOptions = {
      mockSmokeResult: { outcome: 'passed' },
      mockMetrics: {
        errorRatePercent: 0.01,
        p95LatencyMs: 120,
        totalRequests: 1500,
        failedRequests: 0,
        windowMinutes: 30,
      },
      mockRetroResult: defaultMockRetro,
      mockPrCreator,
      repoRoot: harness.tempDir,
    };
```

**Full Evidence State and Archive Verification pattern** (copy from `tests/deploy-orchestrator.test.ts` lines 1012–1032):
```typescript
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket).toBeDefined();

    // Verify all 7 evidence tiers populated with non-null records
    expect(ticket?.auditLogs.length).toBeGreaterThan(0);
    expect(ticket?.auditLogs[0].verdict).toBe('passed'); // L1
    expect(ticket?.scopeLock?.status).toBe('locked');    // L1 scope
    expect(ticket?.l3Evidence.length).toBeGreaterThan(0); // L2/L3
    expect(ticket?.qaEvidence).toBeDefined();             // L3/L5
    expect(ticket?.deploymentRecords.length).toBeGreaterThan(0); // L5
    expect(ticket?.smokeEvidence?.status).toBe('passed'); // L6 smoke
    expect(ticket?.telemetryEvaluations.length).toBeGreaterThan(0); // L6 telemetry
    expect(ticket?.retroRecords.length).toBeGreaterThan(0); // L7 retro
    expect(ticket?.l7Evidence).toBeDefined();             // L7

    // Verify fail-closed compiler succeeded and evidence index exists
    const compiledIndex = await compileL1L7EvidenceIndex(workItemId, { failClosed: true });
    expect(compiledIndex.l1.verdict).toBe('PASSED');
    expect(compiledIndex.l7.takeaways).toContain('Deployment verified');

    // Verify ticket archive file created
    const archivePath = path.join(harness.tempDir, 'archive', `${workItemId}.md`);
    expect(fs.existsSync(archivePath)).toBe(true);
    const archiveContent = fs.readFileSync(archivePath, 'utf8');
    expect(archiveContent).toContain('Deployment verified and stable');
```

---

### `tests/state-matrix-sync.test.ts` (test, file-I/O)

**Analog:** `tests/taxonomy.test.ts` & `07-RESEARCH.md` lines 253–296

**Imports pattern** (copy from `tests/taxonomy.test.ts` lines 1–12):
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { GOLDEN_PATH_V2 } from '../src/pipeline/taxonomy.js';
```

**Markdown Table AST / Row Verification pattern** (adapted from `07-RESEARCH.md` lines 254–296):
```typescript
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
      .filter((l) =>
        l.startsWith('| 1. REFINEMENT') ||
        l.startsWith('| 2. EXECUTION') ||
        l.startsWith('| 3. ACCEPTANCE') ||
        l.startsWith('| 4. RELEASE') ||
        l.startsWith('| 5. RETRO')
      );

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

  it('guarantees no stale SQLite/Drizzle references remain in CLAUDE.md or active docs', () => {
    const claudePath = path.resolve(process.cwd(), 'CLAUDE.md');
    const claudeContent = fs.readFileSync(claudePath, 'utf8');
    expect(claudeContent).not.toMatch(/better-sqlite3/i);
    expect(claudeContent).not.toMatch(/drizzle-orm/i);
    expect(claudeContent).toContain('StateStore');

    const projectPath = path.resolve(process.cwd(), '.planning/PROJECT.md');
    const projectContent = fs.readFileSync(projectPath, 'utf8');
    expect(projectContent).toContain('5 columns, 9 actor-assigned steps, L1–L7 evidence');
  });
});
```

---

### `CLAUDE.md` (config, transform)

**Analog:** `CLAUDE.md` (lines 38–70)

**Stale Stack Replacement pattern:**
```markdown
### State Machine, Database & Queue
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **StateStore (node:fs)** | `built-in` | File-backed persistence | Per-ticket markdown+frontmatter storage under `data/state/tickets/<id>.md`. Crash-atomic writes, zero C++ binaries. | HIGH |
| **p-queue / LaneManager**| `9.3.x` / custom | Per-ticket serial lanes & throttle | Serializes mutations per work item (concurrency: 1 single-writer) and limits active test runs. | HIGH |
```

**Alternatives Considered update:**
```markdown
| **Database & Persistence** | **File-backed StateStore** | better-sqlite3 / PostgreSQL | Zero-ops local markdown+frontmatter storage. Lane-serialized writes guarantee single-writer safety without native binary bindings or schema migrations. |
| **Queue / Task Scheduler** | **LaneManager + p-queue** | BullMQ + Redis | In-process AsyncLocalStorage lane serialization avoids external Redis dependency while enforcing strict per-ticket write atomicity. |
```

---

### `.planning/PROJECT.md` (config, transform)

**Analog:** `.planning/PROJECT.md` (lines 60–76)

**Milestone status & feature checkbox update pattern:**
```markdown
### Active

Milestone **v2.0 — Golden Path v2** (full REQ-ID breakdown defined in `.planning/REQUIREMENTS.md`):

- [x] **RESTRUCTURE**: Re-taxonomize the pipeline into 5 columns / 9 steps with actor roles (⚡/👤) + governance hand-offs; realign state matrix, evidence index, and docs.
- [x] **L7 EVIDENCE**: Add L7 Continuous-Feedback schema and extend the unified evidence index L1–L6 → L1–L7.
- [x] **PM SCOPE GATE**: Add human PM scope-review & verify (scope-lock) gate in REFINEMENT (Step 2) before EXECUTION begins.
- [x] **PROD SMOKE**: Add automated production smoke-test suite in RELEASE (Step 8) alongside the existing telemetry monitor (L6).
- [x] **RETRO OUTPUT**: Emit retro takeaways + runbook updates + skill enhancement as L7 evidence in RETRO (Step 9).
```

---

### `.planning/REQUIREMENTS.md` (config, transform)

**Analog:** `.planning/REQUIREMENTS.md` (lines 26–31, 95–125)

**Requirement check & Traceability update pattern:**
```markdown
### 1. TAX — Taxonomy Restructure (5 columns / 9 steps)

- [x] **TAX-01**: System models the Golden Path v2 as a single data-driven source (`src/pipeline/taxonomy.ts`): each of the 9 steps mapped to its column (Refinement/Execution/Acceptance/Release/Retro), actor (⚡ AI / 👤 Human), evidence level (L1–L7), and ADO state — with no v1.0 directory renames (taxonomy is additive metadata over the existing src dirs).
- [x] **TAX-02**: The ADO state-transition router and the evidence-index stage labels are driven by the v2 taxonomy, and the authoritative state matrix in ROADMAP/docs reflects the 5 columns / 9 steps / L1–L7 model with governance hand-offs.
- [x] **TAX-03**: Taxonomy adoption is behavior-preserving for v1.0 routing — a mapping test asserts all 9 steps resolve column/actor/evidence-level/ADO-state from the taxonomy source, and a v1-lifecycle replay test drives fixture revisions `New → … → Done` asserting identical handler dispatch to v1.0.
```

```markdown
## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
...
| TAX-02 | Phase 7 | Complete |
```

---

### `.planning/ROADMAP.md` (config, transform)

**Analog:** `.planning/ROADMAP.md` (lines 235–251)

**Progress table update pattern:**
```markdown
| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 1. StateStore Migration | 5/5 | Complete | 2026-09-17 |
| 2. Taxonomy Foundation | 2/2 | Complete | 2026-09-17 |
| 3. PM Scope-Lock Gate | 3/3 | Complete | 2026-09-17 |
| 4. L7 Evidence Index Extension | 2/2 | Complete | 2026-09-17 |
| 5. Prod Smoke Suite | 3/3 | Complete | 2026-09-18 |
| 6. Retro & L7 Output | 3/3 | Complete | 2026-09-18 |
| 7. Docs Realignment & E2E Proof | 1/1 | Complete | 2026-09-18 |
```

---

## Shared Patterns

### Ephemeral StateStore Test Harness
**Source:** `src/state/test-harness.ts` lines 13–22  
**Apply to:** All test suites performing state mutations (`tests/e2e-v2-golden-path.test.ts`)
```typescript
const harness = createTestStateStore();
(env as any).STATE_STORE_DIR = harness.tempDir;
resetStateStore();
// ... test operations ...
harness.cleanup();
resetStateStore();
```

### Mock Wit API Dispatch
**Source:** `tests/lifecycle-replay.test.ts` lines 184–195  
**Apply to:** All router and worker lifecycle integration tests
```typescript
const mockWitApi = {
  getWorkItem: vi.fn().mockImplementation((id: number) => Promise.resolve(revisions[currentRev] || revisions[1])),
  getRevision: vi.fn().mockImplementation((id: number, rev: number) => Promise.resolve(revisions[rev] || revisions[1])),
  updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
};
adoClient.setWorkItemTrackingApi(mockWitApi as any);
```

### Lane Serialization Wrapper
**Source:** `src/queue/lane-manager.ts` lines 15–25  
**Apply to:** All operations that mutate ticket state directly in tests or handlers
```typescript
await workItemQueueManager.runInLane(workItemId, async () => {
  await stateStore.updateTicketState(workItemId, (draft) => {
    // mutations
  });
});
```

### Fail-Closed Evidence Index Compilation
**Source:** `src/deploy/evidence-index.ts` lines 112–150  
**Apply to:** Verifying steady-state completion before `Done` transition
```typescript
const summary = await compileL1L7EvidenceIndex(workItemId, { failClosed: true });
expect(summary.l1.verdict).toBe('PASSED');
expect(summary.l7).toBeDefined();
```

---

## No Analog Found

None. All files have 100% analogous structures and patterns established in the repository.

---

## Metadata

**Analog search scope:** `tests/`, `src/pipeline/`, `src/execute/`, `src/deploy/`, `.planning/`  
**Files scanned:** 48  
**Pattern extraction date:** 2026-09-18  
