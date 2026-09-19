import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { env } from '../src/config/env.js';
import {
  compileL1L7EvidenceIndex,
  compileL1L6EvidenceIndex,
  formatEvidenceIndexComment,
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

  it('compiles evidence index for archived tickets using targeted getArchivedTicketState lookup', async () => {
    const workItemId = 8099;
    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.auditLogs.push({
          revId: 1,
          verdict: 'passed',
          reasons: 'Done',
          criteriaSummary: 'DoD complete',
          model: 'gpt-4o',
          evaluatedAt: new Date().toISOString(),
        });
      });
    });

    await stateStore.archiveTicket(workItemId);

    // Active ticket is now null
    expect(await stateStore.getTicketState(workItemId)).toBeNull();

    // Archive lookup succeeds and does not invoke full listTickets scan
    const listSpy = vi.spyOn(stateStore, 'listTickets');
    const summary = await compileL1L7EvidenceIndex(workItemId);
    expect(summary.workItemId).toBe(workItemId);
    expect(summary.l1.verdict).toBe('PASSED');
    expect(listSpy).not.toHaveBeenCalled();
    listSpy.mockRestore();
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

    let laneActiveDuringRead = false;
    const origGet = stateStore.getTicketState.bind(stateStore);
    vi.spyOn(stateStore, 'getTicketState').mockImplementation(async (id) => {
      const { laneContext } = await import('../src/queue/lane-manager.js');
      if (laneContext.getStore()?.workItemId === id) {
        laneActiveDuringRead = true;
      }
      return origGet(id);
    });

    const runInLaneSpy = vi.spyOn(workItemQueueManager, 'runInLane');
    await compileL1L7EvidenceIndex(workItemId);

    expect(runInLaneSpy).toHaveBeenCalledWith(workItemId, expect.any(Function));
    expect(laneActiveDuringRead).toBe(true);
  });

  describe('Fail-Closed Gating (EVID-03)', () => {
    async function seedCompleteTicket(workItemId: number) {
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.auditLogs = [
            {
              revId: 1,
              verdict: 'passed',
              reasons: JSON.stringify(['Testability DoD met', 'Scope bounded']),
              criteriaSummary: 'DoD complete',
              model: 'gpt-4o',
              evaluatedAt: new Date().toISOString(),
            },
          ];
          draft.l2Evidence = {
            reviewPassed: true,
            qualityNotes: 'PR approved by peer reviewer; clean branch policy audit',
          };
          draft.l3Evidence = [
            {
              revId: 3,
              testSuite: 'vitest',
              totalTests: 10,
              passed: 10,
              failed: 0,
              durationMs: 400,
              coverageSummary: '90%',
              gitDiffStat: '1 file changed',
              createdAt: new Date().toISOString(),
            },
          ];
          draft.l4Evidence = {
            securityPassed: true,
            policiesSummary: 'SAST/Security policies green; test assertions immutable; diff ceiling bounded',
          };
          draft.deploymentRecords = [
            {
              pipelineRunId: 'pipe-1',
              stageName: 'DeployToProd',
              environmentName: 'Production',
              commitSha: 'c0ffee',
              status: 'deployed',
              migrationRisk: 'low',
              createdAt: new Date().toISOString(),
            },
          ];
          draft.telemetryEvaluations = [
            {
              windowMinutes: 30,
              errorRate: '0.01%',
              p95LatencyMs: 120,
              breached: 0,
              evaluatedAt: new Date().toISOString(),
            },
          ];
          draft.retroRecords = [
            {
              takeaways: 'Smooth deploy',
              actionItems: ['Monitor latency'],
              runbookDiffPrUrl: 'https://dev.azure.com/pr/1',
              skillPrUrl: 'https://dev.azure.com/pr/2',
              gateFriction: { reworkBounces: 0 },
              trendDeltas: { cycleTimeReductionMinutes: 10 },
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ];
        });
      });
    }

    it('throws MissingEvidenceError with level L1 when ticket has empty auditLogs', async () => {
      const workItemId = 8101;
      await seedCompleteTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.auditLogs = [];
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L1',
      });
    });

    it('throws MissingEvidenceError with level L3 when l3Evidence is empty and qaEvidence is missing', async () => {
      const workItemId = 8102;
      await seedCompleteTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.l3Evidence = [];
          draft.qaEvidence = undefined;
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L3',
      });
    });

    it('throws MissingEvidenceError with level L5 when deploymentRecords is empty', async () => {
      const workItemId = 8103;
      await seedCompleteTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.deploymentRecords = [];
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L5',
      });
    });

    it('throws MissingEvidenceError with level L6 when telemetryEvaluations is empty or breached', async () => {
      const workItemIdEmpty = 8104;
      await seedCompleteTicket(workItemIdEmpty);
      await workItemQueueManager.runInLane(workItemIdEmpty, async () => {
        await stateStore.updateTicketState(workItemIdEmpty, (draft) => {
          draft.telemetryEvaluations = [];
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemIdEmpty, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L6',
      });

      const workItemIdBreached = 8105;
      await seedCompleteTicket(workItemIdBreached);
      await workItemQueueManager.runInLane(workItemIdBreached, async () => {
        await stateStore.updateTicketState(workItemIdBreached, (draft) => {
          draft.telemetryEvaluations = [
            {
              windowMinutes: 30,
              errorRate: '3.5%',
              p95LatencyMs: 900,
              breached: 1,
              evaluatedAt: new Date().toISOString(),
            },
          ];
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemIdBreached, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L6',
      });
    });

    it('throws MissingEvidenceError with level L7 when retroRecords is empty and l7Evidence is null/undefined', async () => {
      const workItemId = 8106;
      await seedCompleteTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.retroRecords = [];
          draft.l7Evidence = undefined;
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L7',
      });
    });

    it('throws MissingEvidenceError with level L7 when retroRecords has an entry with empty or missing takeaways', async () => {
      const workItemId = 8107;
      await seedCompleteTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.retroRecords = [
            {
              takeaways: '',
              actionItems: ['Some action'],
              createdAt: new Date().toISOString(),
            },
          ];
          draft.l7Evidence = undefined;
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L7',
      });
    });

    it('throws MissingEvidenceError with level L7 when takeaways is whitespace-only', async () => {
      const workItemId = 8108;
      await seedCompleteTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.retroRecords = [
            {
              takeaways: '   \t\n  ',
              actionItems: ['Some action'],
              createdAt: new Date().toISOString(),
            },
          ];
          draft.l7Evidence = undefined;
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L7',
      });
    });
  });

  describe('Cutover Tolerance', () => {
    it('permits missing L7 and renders [PENDING — retro in progress] when failClosed is false or omitted', async () => {
      const workItemId = 8201;
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.auditLogs = [
            {
              revId: 1,
              verdict: 'passed',
              reasons: JSON.stringify(['DoD met']),
              criteriaSummary: 'Criteria verified',
              model: 'gpt-4o',
              evaluatedAt: new Date().toISOString(),
            },
          ];
          draft.l3Evidence = [
            {
              revId: 2,
              testSuite: 'vitest',
              totalTests: 5,
              passed: 5,
              failed: 0,
              durationMs: 200,
              coverageSummary: '95%',
              gitDiffStat: '1 file changed',
              createdAt: new Date().toISOString(),
            },
          ];
          draft.deploymentRecords = [
            {
              pipelineRunId: 'pipe-cutover',
              stageName: 'DeployToProd',
              environmentName: 'Production',
              commitSha: 'feedface',
              status: 'deployed',
              migrationRisk: 'low',
              createdAt: new Date().toISOString(),
            },
          ];
          draft.telemetryEvaluations = [
            {
              windowMinutes: 30,
              errorRate: '0.00%',
              p95LatencyMs: 110,
              breached: 0,
              evaluatedAt: new Date().toISOString(),
            },
          ];
          draft.retroRecords = [];
          draft.l7Evidence = undefined;
        });
      });

      const summary = await compileL1L7EvidenceIndex(workItemId, { failClosed: false });
      expect(summary.l7).toBeNull();

      const comment = formatEvidenceIndexComment(summary);
      expect(comment).toContain('[PENDING — retro in progress]');
      expect(comment).toContain('Continuous feedback collection pending completion of retrospective step.');
    });

    it('safely handles undefined or non-array actionItems in formatEvidenceIndexComment', () => {
      const partialSummary = {
        workItemId: 8202,
        l1: { verdict: 'PASSED', criteriaSummary: 'Done', reasons: [] },
        l2: { reviewPassed: true, qualityNotes: 'Approved' },
        l3: { localTestsPassed: 1, localTestsTotal: 1, qaTestsPassed: 1, qaTestsTotal: 1, flakeCleared: false },
        l4: { securityPassed: true, policiesSummary: 'Clean' },
        l5: { environmentName: 'Production', commitSha: '12345678', migrationRisk: 'low', status: 'deployed' },
        l6: { errorRate: '0%', p95LatencyMs: 50, windowMinutes: 30, breached: false },
        l7: {
          status: 'RECORDED',
          takeaways: 'Some takeaway',
          actionItems: undefined as unknown as string[],
        },
      } as L1L7EvidenceSummary;

      expect(() => formatEvidenceIndexComment(partialSummary)).not.toThrow();
      const html = formatEvidenceIndexComment(partialSummary);
      expect(html).toContain('Action items: <code>0</code>');
    });
  });

  describe('Recompilation Freshness', () => {
    it('updates draft.evidenceIndex.l7Summary cleanly after an L7 update without stale or null state', async () => {
      const workItemId = 8301;
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.auditLogs = [
            {
              revId: 1,
              verdict: 'passed',
              reasons: JSON.stringify(['DoD met']),
              criteriaSummary: 'Criteria verified',
              model: 'gpt-4o',
              evaluatedAt: new Date().toISOString(),
            },
          ];
          draft.deploymentRecords = [
            {
              pipelineRunId: 'pipe-fresh',
              stageName: 'DeployToProd',
              environmentName: 'Production',
              commitSha: 'feedface',
              status: 'deployed',
              migrationRisk: 'low',
              createdAt: new Date().toISOString(),
            },
          ];
          draft.retroRecords = [];
          draft.l7Evidence = undefined;
        });
      });

      await compileL1L7EvidenceIndex(workItemId);
      let ticket = await stateStore.getTicketState(workItemId);
      expect(ticket?.evidenceIndex?.l7Summary).toBeNull();

      // Append fresh retro record
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.retroRecords.push({
            takeaways: 'Fresh takeaways from retro run',
            actionItems: ['Item A', 'Item B'],
            runbookDiffPrUrl: 'https://dev.azure.com/pr/999',
            skillPrUrl: 'https://dev.azure.com/pr/1000',
            gateFriction: { reworkBounces: 2 },
            trendDeltas: { cycleTimeReductionMinutes: 30 },
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          });
        });
      });

      const refreshedSummary = await compileL1L7EvidenceIndex(workItemId);
      expect(refreshedSummary.l7).toBeDefined();
      expect(refreshedSummary.l7?.takeaways).toBe('Fresh takeaways from retro run');

      ticket = await stateStore.getTicketState(workItemId);
      expect(ticket?.evidenceIndex?.l7Summary).not.toBeNull();
      const parsed = JSON.parse(ticket!.evidenceIndex!.l7Summary!);
      expect(parsed.takeaways).toBe('Fresh takeaways from retro run');
      expect(parsed.actionItems).toEqual(['Item A', 'Item B']);
    });
  });

  describe('Zero Fabricated Defaults Assertion', () => {
    it('verifies src/deploy/evidence-index.ts has zero fallback operators (??, ||) in L7 extraction', () => {
      const sourcePath = path.resolve(process.cwd(), 'src/deploy/evidence-index.ts');
      const source = fs.readFileSync(sourcePath, 'utf8');

      const l7BlockMatch = source.match(/let l7Summary:[\s\S]*?const summary:/);
      expect(l7BlockMatch).not.toBeNull();
      const l7Block = l7BlockMatch![0];

      const checkedFields = [
        'takeaways',
        'actionItems',
        'runbookDiffPrUrl',
        'skillPrUrl',
        'gateFriction',
        'trendDeltas',
      ];

      for (const field of checkedFields) {
        const fieldLineMatch = l7Block.match(new RegExp(`${field}:.*`));
        expect(fieldLineMatch).not.toBeNull();
        const line = fieldLineMatch![0];
        expect(line).not.toMatch(/(\?\?|\|\|)/);
      }
    });
  });
});
