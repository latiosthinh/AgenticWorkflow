import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { adoClient } from '../src/ado/client.js';
import { env } from '../src/config/env.js';
import {
  compileL1L6EvidenceIndex,
  compileL1L7EvidenceIndex,
  formatEvidenceIndexComment,
  MissingEvidenceError,
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

  async function seedStandardPassingEvidence(workItemId: number) {
    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        if (!draft.auditLogs.length) {
          draft.auditLogs.push({
            revId: 1,
            verdict: 'passed',
            reasons: JSON.stringify(['DoD verified']),
            criteriaSummary: 'DoD Criteria complete',
            model: 'gpt-4o',
            evaluatedAt: new Date().toISOString(),
          });
        }
        if (!draft.l3Evidence.length) {
          draft.l3Evidence.push({
            revId: 1,
            testSuite: 'vitest',
            totalTests: 10,
            passed: 10,
            failed: 0,
            durationMs: 400,
            coverageSummary: '90%',
            gitDiffStat: '2 files changed',
            createdAt: new Date().toISOString(),
          });
        }
        if (!draft.deploymentRecords.length) {
          draft.deploymentRecords.push({
            pipelineRunId: `run-${workItemId}`,
            stageName: 'DeployToProduction',
            environmentName: 'Production',
            commitSha: 'beefcafe1234',
            status: 'pending_approval',
            migrationRisk: 'low',
            createdAt: new Date().toISOString(),
          });
        }
        if (!draft.l2Evidence) {
          draft.l2Evidence = {
            reviewPassed: true,
            qualityNotes: 'PR approved by peer reviewer; clean branch policy audit',
          };
        }
        if (!draft.l4Evidence) {
          draft.l4Evidence = {
            securityPassed: true,
            policiesSummary: 'SAST/Security policies green; test assertions immutable; diff ceiling bounded',
          };
        }
      });
    });
  }

  const defaultMockRetro = {
    takeaways: 'Deployment verified and stable',
    actionItems: [
      {
        action: 'Observe post-deploy metrics',
        owner: 'Platform Team',
        priority: 'P2' as const,
        trackingRef: 'AB#7000',
      },
    ],
    gateFriction: {
      scopeRejections: 0,
      reworkBounces: 0,
      qaStrikes: 0,
      smokeFlakes: 0,
    },
    trendDeltas: {
      leadTimeMinutes: 15,
      leadTimeDeltaMinutes: 0,
      reworkBounces: 0,
      reworkDelta: 0,
      historicalDeployedCount: 1,
      trend: 'stable' as const,
    },
  };

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
      expect(html).toContain('[Golden Path Complete] Unified L1–L7 Evidence Index');
      expect(html).toContain('L1');
      expect(html).toContain('L2');
      expect(html).toContain('L3');
      expect(html).toContain('L4');
      expect(html).toContain('L5');
      expect(html).toContain('L6');
      expect(html).toContain('L7');
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
      await seedStandardPassingEvidence(workItemId);

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

      const mockPrCreator = vi.fn().mockResolvedValue({
        pullRequestId: 501,
        url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/501',
      });

      const { result, summary } = await processTelemetryEvaluation(workItemId, {
        mockMetrics,
        commitSha: '112233445566',
        mockRetroResult: defaultMockRetro,
        mockPrCreator,
        repoRoot: harness.tempDir,
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
            value: expect.stringContaining('[Golden Path Complete] Unified L1–L7 Evidence Index'),
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

      await seedStandardPassingEvidence(workItemId);

      const mockMetrics = {
        errorRatePercent: 0.05,
        p95LatencyMs: 140,
        totalRequests: 2000,
        failedRequests: 1,
        windowMinutes: 30,
      };

      const mockPrCreator = vi.fn().mockResolvedValue({
        pullRequestId: 502,
        url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/502',
      });

      stateStore.recordDedupEvent(workItemId, 2, 'hash-7301');

      await routeWorkItemEvent(workItemId, 2, {
        mockMetrics,
        commitSha: '998877112233',
        mockRetroResult: defaultMockRetro,
        mockPrCreator,
        repoRoot: harness.tempDir,
      });

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Done' }),
        ])
      );
    });
  });

  describe('processDeploymentWorkflow fail-fast sequencing and composite L6 verification', () => {
    it('fails fast on smoke failure without evaluating telemetry window', async () => {
      const workItemId = 7401;

      vi.spyOn(adoClient, 'getRevision').mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'Release broken build',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'Release broken build',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      await processDeploymentWorkflow(workItemId, 1, {
        skipPreparation: true,
        mockSmokeResult: {
          outcome: 'failed',
          classification: 'APP',
        },
        mockMetrics: {
          errorRatePercent: 0.01,
          p95LatencyMs: 100,
          totalRequests: 500,
          failedRequests: 0,
          windowMinutes: 30,
        },
      });

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'In Dev' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[deploy-regressed]'),
          }),
        ])
      );

      // Verify Done transition was never triggered
      expect(updateSpy).not.toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Done' }),
        ])
      );
    });

    it('retains Ready to Deploy with [smoke-harness-error] on INFRA smoke failure', async () => {
      const workItemId = 7402;

      vi.spyOn(adoClient, 'getRevision').mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'Release with network blip',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'Release with network blip',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      await processDeploymentWorkflow(workItemId, 1, {
        skipPreparation: true,
        mockSmokeResult: {
          outcome: 'failed',
          classification: 'INFRA',
        },
      });

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[smoke-harness-error]'),
          }),
          expect.objectContaining({
            path: '/fields/System.History',
            value: expect.stringContaining('[L6 Smoke Alert] Production Smoke Harness Infrastructure Error'),
          }),
        ])
      );

      const patch = updateSpy.mock.calls[0][1];
      const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
      expect(stateOp).toBeUndefined();
    });

    it('completes deployment workflow to Done when both smoke and telemetry pass', async () => {
      const workItemId = 7403;

      vi.spyOn(adoClient, 'getRevision').mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'Release rock-solid feature',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'Release rock-solid feature',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      await seedStandardPassingEvidence(workItemId);

      const mockPrCreator = vi.fn().mockResolvedValue({
        pullRequestId: 503,
        url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/503',
      });

      await processDeploymentWorkflow(workItemId, 1, {
        skipPreparation: true,
        mockSmokeResult: {
          outcome: 'passed',
        },
        mockMetrics: {
          errorRatePercent: 0.01,
          p95LatencyMs: 120,
          totalRequests: 1000,
          failedRequests: 0,
          windowMinutes: 30,
        },
        mockRetroResult: defaultMockRetro,
        mockPrCreator,
        repoRoot: harness.tempDir,
      });

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Done' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[golden-path-complete]'),
          }),
        ])
      );
    });

    it('incorporates smoke verification into composite L6 evidence in compileL1L7EvidenceIndex', async () => {
      const workItemId = 7404;

      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.auditLogs.push({
            revId: 1,
            verdict: 'passed',
            reasons: JSON.stringify(['DoD met']),
            criteriaSummary: 'DoD Criteria complete',
            model: 'gpt-4o',
            evaluatedAt: new Date().toISOString(),
          });
          draft.l2Evidence = {
            reviewPassed: true,
            qualityNotes: 'PR approved by peer reviewer; clean branch policy audit',
          };
          draft.l3Evidence.push({
            revId: 1,
            testSuite: 'vitest',
            totalTests: 5,
            passed: 5,
            failed: 0,
            durationMs: 200,
            coverageSummary: '90%',
            gitDiffStat: '1 file changed',
            createdAt: new Date().toISOString(),
          });
          draft.l4Evidence = {
            securityPassed: true,
            policiesSummary: 'SAST/Security policies green; test assertions immutable; diff ceiling bounded',
          };
          draft.deploymentRecords.push({
            pipelineRunId: 'run-1',
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
          draft.smokeEvidence = {
            status: 'passed',
            classification: 'NONE',
            commitSha: 'beefcafe1234',
            smokeUrl: 'https://prod.app.net',
            checksTotal: 4,
            checksPassed: 4,
            checksFailed: 0,
            durationMs: 1200,
            flakeCleared: false,
            createdAt: new Date().toISOString(),
          };
          draft.retroRecords = [
            {
              takeaways: 'Deployment was smooth and verified',
              actionItems: ['Monitor edge cases'],
              createdAt: new Date().toISOString(),
            },
          ];
        });
      });

      const summary = await compileL1L7EvidenceIndex(workItemId, { failClosed: true });

      expect(summary.l6.smokePassed).toBe(true);
      expect(summary.l6.smokeStatus).toBe('passed');
      expect(summary.l6.smokeChecksPassed).toBe(4);
      expect(summary.l6.smokeChecksTotal).toBe(4);

      const html = formatEvidenceIndexComment(summary);
      expect(html).toContain('Smoke: [PASSED] (4/4 checks)');
      expect(html).toContain('30-min observation: Error rate <code>0.02%</code>');
    });

    it('throws MissingEvidenceError in compileL1L7EvidenceIndex when failClosed is true and smoke verification failed', async () => {
      const workItemId = 7405;

      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.auditLogs.push({
            revId: 1,
            verdict: 'passed',
            reasons: JSON.stringify(['DoD met']),
            criteriaSummary: 'DoD Criteria complete',
            model: 'gpt-4o',
            evaluatedAt: new Date().toISOString(),
          });
          draft.l2Evidence = {
            reviewPassed: true,
            qualityNotes: 'PR approved by peer reviewer; clean branch policy audit',
          };
          draft.l3Evidence.push({
            revId: 1,
            testSuite: 'vitest',
            totalTests: 5,
            passed: 5,
            failed: 0,
            durationMs: 200,
            coverageSummary: '90%',
            gitDiffStat: '1 file changed',
            createdAt: new Date().toISOString(),
          });
          draft.l4Evidence = {
            securityPassed: true,
            policiesSummary: 'SAST/Security policies green; test assertions immutable; diff ceiling bounded',
          };
          draft.deploymentRecords.push({
            pipelineRunId: 'run-1',
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
          draft.smokeEvidence = {
            status: 'failed',
            classification: 'APP',
            commitSha: 'beefcafe1234',
            checksTotal: 4,
            checksPassed: 2,
            checksFailed: 2,
            durationMs: 1200,
            flakeCleared: false,
            createdAt: new Date().toISOString(),
          };
          draft.retroRecords = [
            {
              takeaways: 'Failed release',
              actionItems: [],
              createdAt: new Date().toISOString(),
            },
          ];
        });
      });

      await expect(compileL1L7EvidenceIndex(workItemId, { failClosed: true })).rejects.toThrow(
        /Failed L6 smoke verification for #7405/
      );
    });
  });

  describe('Awaited Retrospective, Retry Cap & Fail-Closed Gate (RETRO-01, RETRO-03, EVID-03)', () => {
    it('verifies code-ordering: retro awaited and L7 persisted before Done transition', async () => {
      const workItemId = 7501;
      await seedStandardPassingEvidence(workItemId);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 3,
        fields: {
          'System.Title': 'Verify Ordering',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const callOrder: string[] = [];

      const origUpdateTicket = stateStore.updateTicketState.bind(stateStore);
      vi.spyOn(stateStore, 'updateTicketState').mockImplementation(async (id, mutator) => {
        const res = await origUpdateTicket(id, mutator);
        if (id === workItemId) {
          const t = await stateStore.getTicketState(workItemId);
          if (t?.l7Evidence && !callOrder.includes('l7-persisted')) {
            callOrder.push('l7-persisted');
          }
        }
        return res;
      });

      vi.spyOn(adoClient, 'updateWorkItem').mockImplementation(async (id, patch) => {
        const hasDone = patch.some(
          (op: any) => op.path === '/fields/System.State' && op.value === 'Done'
        );
        if (hasDone) {
          callOrder.push('ado-done-patched');
        }
        return { id } as any;
      });

      const mockPrCreator = vi.fn().mockResolvedValue({
        pullRequestId: 751,
        url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/751',
      });

      await processTelemetryEvaluation(workItemId, {
        mockMetrics: {
          errorRatePercent: 0.05,
          p95LatencyMs: 110,
          totalRequests: 1000,
          failedRequests: 0,
          windowMinutes: 30,
        },
        mockRetroResult: defaultMockRetro,
        mockPrCreator,
        repoRoot: harness.tempDir,
      });

      expect(callOrder).toEqual(['l7-persisted', 'ado-done-patched']);
    });

    it('recovers if retro fails on attempt 1 and succeeds on attempt 2', async () => {
      const workItemId = 7502;
      await seedStandardPassingEvidence(workItemId);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 3,
        fields: {
          'System.Title': 'Retro Retry Success',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      let attempts = 0;
      const mockPrCreator = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Temporary network glitch during PR creation');
        }
        return {
          pullRequestId: 752,
          url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/752',
        };
      });

      const { result, summary } = await processTelemetryEvaluation(workItemId, {
        mockMetrics: {
          errorRatePercent: 0.02,
          p95LatencyMs: 120,
          totalRequests: 1000,
          failedRequests: 0,
          windowMinutes: 30,
        },
        mockRetroResult: defaultMockRetro,
        mockPrCreator,
        repoRoot: harness.tempDir,
      });

      expect(attempts).toBe(2);
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
        ])
      );
    });

    it('halts Done transition and tags [retro-failed] when retro fails on both attempts', async () => {
      const workItemId = 7503;
      await seedStandardPassingEvidence(workItemId);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 3,
        fields: {
          'System.Title': 'Retro Double Fault',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      let attempts = 0;
      const mockPrCreator = vi.fn().mockImplementation(async () => {
        attempts++;
        throw new Error('Persistent GitHub/ADO outage');
      });

      await expect(
        processTelemetryEvaluation(workItemId, {
          mockMetrics: {
            errorRatePercent: 0.02,
            p95LatencyMs: 120,
            totalRequests: 1000,
            failedRequests: 0,
            windowMinutes: 30,
          },
          mockRetroResult: defaultMockRetro,
          mockPrCreator,
          repoRoot: harness.tempDir,
        })
      ).rejects.toThrow(
        /Retrospective feedback loop failed after retry for #7503; Done transition halted/
      );

      expect(attempts).toBe(2);

      // Verify work item was updated with [retro-failed] and alert comment
      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[retro-failed]'),
          }),
          expect.objectContaining({
            path: '/fields/System.History',
            value: expect.stringContaining('[L7 Retro Alert] Retrospective Generation Failed'),
          }),
        ])
      );

      // Verify state was NEVER changed to Done
      expect(updateSpy).not.toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Done' }),
        ])
      );
    });

    it('compileL1L7EvidenceIndex with failClosed: true throws MissingEvidenceError when retro record is missing', async () => {
      const workItemId = 7504;
      await seedStandardPassingEvidence(workItemId);

      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.telemetryEvaluations.push({
            windowMinutes: 30,
            errorRate: '0.02%',
            p95LatencyMs: 140,
            breached: 0,
            evaluatedAt: new Date().toISOString(),
          });
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toThrow(MissingEvidenceError);

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toThrow(/Missing required L7 continuous feedback record for #7504/);
    });

    it('executes full processDeploymentWorkflow end-to-end (smoke pass -> telemetry pass -> retro pass -> Done)', async () => {
      const workItemId = 7505;
      await seedStandardPassingEvidence(workItemId);

      vi.spyOn(adoClient, 'getRevision').mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'End-to-end Golden Path',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'End-to-end Golden Path',
          'System.State': 'Ready to Deploy',
          'System.Tags': '[qa-verified]; [deploying]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      const mockPrCreator = vi.fn().mockResolvedValue({
        pullRequestId: 755,
        url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/755',
      });

      await processDeploymentWorkflow(workItemId, 1, {
        skipPreparation: true,
        mockSmokeResult: {
          outcome: 'passed',
        },
        mockMetrics: {
          errorRatePercent: 0.01,
          p95LatencyMs: 100,
          totalRequests: 2000,
          failedRequests: 0,
          windowMinutes: 30,
        },
        mockRetroResult: defaultMockRetro,
        mockPrCreator,
        repoRoot: harness.tempDir,
      });

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
            value: expect.stringContaining('[Golden Path Complete] Unified L1–L7 Evidence Index'),
          }),
        ])
      );

      const archivePath = path.join(harness.tempDir, 'archive', `${workItemId}.md`);
      expect(fs.existsSync(archivePath)).toBe(true);
      const content = fs.readFileSync(archivePath, 'utf8');
      expect(content).toContain('Deployment verified and stable');
    });
  });
});
