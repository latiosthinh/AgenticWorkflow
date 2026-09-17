import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { adoClient } from '../src/ado/client.js';
import { env } from '../src/config/env.js';
import {
  compileL1L6EvidenceIndex,
  formatEvidenceIndexComment,
} from '../src/deploy/evidence-index.js';
import {
  processDeploymentPreparation,
  processTelemetryEvaluation,
  processDeploymentWorkflow,
} from '../src/deploy/worker.js';
import { routeWorkItemEvent } from '../src/execute/router.js';

describe('Deploy & Telemetry Orchestrator (DPLY-01, DPLY-02, DPLY-03)', () => {
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

  describe('Evidence Index Aggregator & Formatter', () => {
    it('aggregates L1 through L6 evidence from respective tables', async () => {
      const workItemId = 7001;

      // Seed prior stage evidence in StateStore
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
            totalTests: 15,
            passed: 15,
            failed: 0,
            durationMs: 850,
            coverageSummary: '88%',
            gitDiffStat: '3 files changed, 120 insertions(+)',
            createdAt: new Date().toISOString(),
          });
          draft.qaEvidence = {
            totalTests: 20,
            passedCount: 20,
            failedCount: 0,
            durationMs: 3200,
            commitSha: 'beefcafe1234',
            stagingUrl: 'https://staging.app.net',
            flakeCleared: 0,
            createdAt: new Date().toISOString(),
          };
          draft.deploymentRecords.push({
            pipelineRunId: 'run-99',
            stageName: 'DeployToProd',
            environmentName: 'Production',
            commitSha: 'beefcafe1234',
            status: 'deployed',
            migrationRisk: 'low',
            createdAt: new Date().toISOString(),
          });
          draft.telemetryEvaluations.push({
            windowMinutes: 30,
            errorRate: '0.02%',
            p95LatencyMs: 140,
            breached: 0,
            evaluatedAt: new Date().toISOString(),
          });
        });
      });

      const summary = await compileL1L6EvidenceIndex(workItemId);

      expect(summary.workItemId).toBe(workItemId);
      expect(summary.l1.verdict).toBe('PASSED');
      expect(summary.l3.localTestsPassed).toBe(15);
      expect(summary.l3.qaTestsPassed).toBe(20);
      expect(summary.l5.environmentName).toBe('Production');
      expect(summary.l6.errorRate).toBe('0.02%');
      expect(summary.l6.breached).toBe(false);

      const html = formatEvidenceIndexComment(summary);
      expect(html).toContain('[Golden Path Complete] Unified L1–L6 Evidence Index');
      expect(html).toContain('L1');
      expect(html).toContain('L2');
      expect(html).toContain('L3');
      expect(html).toContain('L4');
      expect(html).toContain('L5');
      expect(html).toContain('L6');
      expect(html).toContain('<!-- [automated-agent] -->');
    });
  });

  describe('processDeploymentPreparation', () => {
    it('attaches L5 readiness packet and tags work item [deploying]', async () => {
      const workItemId = 7101;

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 4,
        fields: {
          'System.Title': 'Release shopping cart service',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      await processDeploymentPreparation(workItemId, {
        commitSha: 'c0ffee112233',
        filesModified: ['src/cart.ts'],
        environmentName: 'Production',
      });

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[deploying]'),
          }),
          expect.objectContaining({
            path: '/fields/System.History',
            value: expect.stringContaining('[L5 Evidence] Native Environment Deployment Readiness'),
          }),
        ])
      );

      const ticket = await stateStore.getTicketState(workItemId);
      const record = ticket?.deploymentRecords[0];

      expect(record).toBeDefined();
      expect(record?.status).toBe('pending_approval');
    });
  });

  describe('processTelemetryEvaluation', () => {
    it('transitions to Done with [golden-path-complete] when telemetry window passes', async () => {
      const workItemId = 7201;

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 5,
        fields: {
          'System.Title': 'Release Payment Integration',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      const mockMetrics = {
        errorRatePercent: 0.1,
        p95LatencyMs: 160,
        totalRequests: 8000,
        failedRequests: 8,
        windowMinutes: 30,
      };

      const { result, summary } = await processTelemetryEvaluation(workItemId, {
        mockMetrics,
        commitSha: '112233445566',
      });

      expect(result.breached).toBe(false);
      expect(summary).toBeDefined();

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Done' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[golden-path-complete]'),
          }),
          expect.objectContaining({
            path: '/fields/System.History',
            value: expect.stringContaining('[Golden Path Complete] Unified L1–L6 Evidence Index'),
          }),
        ])
      );
    });

    it('bounces ticket to In Dev with [deploy-regressed] on telemetry breach', async () => {
      const workItemId = 7202;

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 5,
        fields: {
          'System.Title': 'Release with memory leak',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      const mockBreachedMetrics = {
        errorRatePercent: 3.8, // breached (> 1.0%)
        p95LatencyMs: 820, // breached (> 500ms)
        totalRequests: 5000,
        failedRequests: 190,
        windowMinutes: 30,
      };

      const { result } = await processTelemetryEvaluation(workItemId, {
        mockMetrics: mockBreachedMetrics,
        commitSha: 'badbeef12345',
      });

      expect(result.breached).toBe(true);

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'In Dev' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[deploy-regressed]'),
          }),
          expect.objectContaining({
            path: '/fields/System.History',
            value: expect.stringContaining('[L6 Telemetry Alert] Production Performance Regression'),
          }),
        ])
      );
    });

    it('blocks the Done transition and rethrows when telemetry evaluation fails (fail-closed)', async () => {
      const workItemId = 7203;
      const originalNodeEnv = env.NODE_ENV;

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 5,
        fields: {
          'System.Title': 'Release with broken telemetry creds',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      try {
        // No App Insights creds configured + non-test env → queryAzureMonitorMetrics must throw.
        env.NODE_ENV = 'production';
        await expect(processTelemetryEvaluation(workItemId)).rejects.toThrow(
          /credentials missing/i
        );
      } finally {
        env.NODE_ENV = originalNodeEnv;
      }

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('routeWorkItemEvent integration', () => {
    it('routes Ready to Deploy tickets to processDeploymentWorkflow', async () => {
      const workItemId = 7301;

      vi.spyOn(adoClient, 'getRevision').mockResolvedValue({
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'Feature Ready to Deploy',
          'System.State': 'Ready to Deploy',
        },
      } as any);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'Feature Ready to Deploy',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      const mockMetrics = {
        errorRatePercent: 0.05,
        p95LatencyMs: 140,
        totalRequests: 2000,
        failedRequests: 1,
        windowMinutes: 30,
      };

      stateStore.recordDedupEvent(workItemId, 2, 'hash-7301');

      await routeWorkItemEvent(workItemId, 2, {
        mockMetrics,
        commitSha: '998877112233',
      });

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Done' }),
        ])
      );
    });
  });
});
