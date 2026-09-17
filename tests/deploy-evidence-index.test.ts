import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { env } from '../src/config/env.js';
import {
  compileL1L7EvidenceIndex,
  compileL1L6EvidenceIndex,
  MissingEvidenceError,
  type L1L7EvidenceSummary,
} from '../src/deploy/evidence-index.js';

describe('Evidence Index Compilation & Persistence (EVID-02)', () => {
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

  it('throws MissingEvidenceError when work item not found in state store', async () => {
    const workItemId = 99999;
    await expect(compileL1L7EvidenceIndex(workItemId)).rejects.toThrow(MissingEvidenceError);
  });

  it('compiles L1 through L7 evidence and persists l7Summary into TicketState evidenceIndex', async () => {
    const workItemId = 8001;

    // Seed prior stage evidence including L7 retro record in StateStore
    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.auditLogs.push({
          revId: 1,
          verdict: 'passed',
          reasons: JSON.stringify(['Testability DoD met', 'Scope bounded']),
          criteriaSummary: 'DoD Criteria complete',
          model: 'gpt-4o',
          evaluatedAt: new Date().toISOString(),
        });
        draft.l3Evidence.push({
          revId: 3,
          testSuite: 'vitest',
          totalTests: 10,
          passed: 10,
          failed: 0,
          durationMs: 450,
          coverageSummary: '92%',
          gitDiffStat: '2 files changed, 40 insertions(+)',
          createdAt: new Date().toISOString(),
        });
        draft.qaEvidence = {
          totalTests: 15,
          passedCount: 15,
          failedCount: 0,
          durationMs: 1200,
          commitSha: 'a1b2c3d4e5f6',
          stagingUrl: 'https://staging.app.net',
          flakeCleared: 0,
          createdAt: new Date().toISOString(),
        };
        draft.deploymentRecords.push({
          pipelineRunId: 'pipe-8001',
          stageName: 'DeployToProd',
          environmentName: 'Production',
          commitSha: 'a1b2c3d4e5f6',
          status: 'deployed',
          migrationRisk: 'low',
          createdAt: new Date().toISOString(),
        });
        draft.telemetryEvaluations.push({
          windowMinutes: 30,
          errorRate: '0.01%',
          p95LatencyMs: 120,
          breached: 0,
          evaluatedAt: new Date().toISOString(),
        });
        draft.retroRecords = [
          {
            takeaways: 'Automated telemetry gates prevented bad rollout',
            actionItems: ['Add synthetic canary check'],
            runbookDiffPrUrl: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/101',
            skillPrUrl: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/102',
            gateFriction: {
              scopeRejections: 0,
              reworkBounces: 1,
              qaStrikes: 0,
              smokeFlakes: 0,
            },
            trendDeltas: {
              cycleTimeReductionMinutes: 15,
            },
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        ];
      });
    });

    const summary: L1L7EvidenceSummary = await compileL1L7EvidenceIndex(workItemId);

    expect(summary.workItemId).toBe(workItemId);
    expect(summary.l1.verdict).toBe('PASSED');
    expect(summary.l3.localTestsPassed).toBe(10);
    expect(summary.l3.qaTestsPassed).toBe(15);
    expect(summary.l5.environmentName).toBe('Production');
    expect(summary.l6.errorRate).toBe('0.01%');
    expect(summary.l6.breached).toBe(false);
    expect(summary.l7).toBeDefined();
    expect(summary.l7?.status).toBe('RECORDED');
    expect(summary.l7?.takeaways).toBe('Automated telemetry gates prevented bad rollout');
    expect(summary.l7?.actionItems).toEqual(['Add synthetic canary check']);
    expect(summary.l7?.runbookDiffPrUrl).toBe('https://dev.azure.com/org/proj/_git/repo/pullrequest/101');
    expect(summary.l7?.skillPrUrl).toBe('https://dev.azure.com/org/proj/_git/repo/pullrequest/102');
    expect(summary.l7?.gateFriction?.reworkBounces).toBe(1);

    // Verify persistence in StateStore
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.evidenceIndex).toBeDefined();
    expect(ticket?.evidenceIndex?.l7Summary).toBeDefined();
    const persistedL7 = JSON.parse(ticket!.evidenceIndex!.l7Summary!);
    expect(persistedL7.takeaways).toBe('Automated telemetry gates prevented bad rollout');
    expect(persistedL7.actionItems).toEqual(['Add synthetic canary check']);
  });

  it('compileL1L6EvidenceIndex functions as a backward-compatible deprecated alias returning L1L7EvidenceSummary', async () => {
    const workItemId = 8002;

    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.auditLogs.push({
          revId: 1,
          verdict: 'passed',
          reasons: 'All criteria met',
          criteriaSummary: 'DoD Criteria complete',
          model: 'gpt-4o',
          evaluatedAt: new Date().toISOString(),
        });
      });
    });

    const summary = await compileL1L6EvidenceIndex(workItemId);
    expect(summary.workItemId).toBe(workItemId);
    expect(summary.l1.verdict).toBe('PASSED');
    expect(summary.l1.reasons).toEqual(['All criteria met']);

    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.evidenceIndex).toBeDefined();
    expect(ticket?.evidenceIndex?.l1Summary).toBeDefined();
  });

  it('runs StateStore update within workItemQueueManager.runInLane maintaining single-writer safety', async () => {
    const workItemId = 8003;

    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.auditLogs.push({
          revId: 1,
          verdict: 'passed',
          reasons: 'Single writer check',
          criteriaSummary: 'Lane safety verified',
          model: 'gpt-4o',
          evaluatedAt: new Date().toISOString(),
        });
      });
    });

    const runInLaneSpy = vi.spyOn(workItemQueueManager, 'runInLane');
    await compileL1L7EvidenceIndex(workItemId);

    expect(runInLaneSpy).toHaveBeenCalledWith(workItemId, expect.any(Function));
  });
});
