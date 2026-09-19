import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { adoClient } from '../src/ado/client.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { processQaVerification } from '../src/qa/worker.js';
import {
  compileL1L7EvidenceIndex,
  MissingEvidenceError,
} from '../src/deploy/evidence-index.js';
import { createOrGetPullRequest } from '../src/ado/git.js';
import * as worktreeModule from '../src/sandbox/worktree.js';
import { simpleGit } from 'simple-git';

vi.mock('../src/ado/git.js', () => ({
  createOrGetPullRequest: vi.fn().mockResolvedValue({
    pullRequestId: 1234,
    title: 'Test PR',
    sourceRefName: 'refs/heads/task/ticket-901-test',
    targetRefName: 'refs/heads/main',
  }),
}));

vi.mock('simple-git', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    simpleGit: vi.fn().mockImplementation((baseDir: string, options?: any) => {
      const gitInstance = actual.simpleGit(baseDir, options);
      return gitInstance;
    }),
  };
});

describe('Honest Evidence & Zero Fabrication (CORE-04)', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;
  let mockWitApi: any;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    vi.restoreAllMocks();

    mockWitApi = {
      getWorkItem: vi.fn(),
      getRevision: vi.fn(),
      updateWorkItem: vi.fn().mockResolvedValue({ id: 900 }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);
  });

  afterEach(() => {
    adoClient.setWorkItemTrackingApi(null);
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
  });

  describe('Router Step 4 - Real L3 Evidence Requirement', () => {
    it('throws MissingEvidenceError and flags ticket Blocked when step 4 lacks L3 evidence', async () => {
      const workItemId = 901;
      const revId = 4;

      // Seed ticket in Dev Done with NO L3 evidence
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.l3Evidence = [];
        });
      });

      stateStore.recordDedupEvent(workItemId, revId, 'hash-901-4');

      mockWitApi.getWorkItem.mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Implement feature without tests',
          'System.State': 'Dev Done',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'AC details',
        },
      });

      mockWitApi.getRevision.mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Implement feature without tests',
          'System.State': 'Dev Done',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'AC details',
        },
      });

      await expect(routeWorkItemEvent(workItemId, revId)).rejects.toThrow(MissingEvidenceError);

      // Verify dedup status is failed
      const dedup = stateStore.getDedupEvent?.(workItemId, revId);
      expect(dedup?.status).toBe('failed');
      expect(dedup?.errorMessage).toContain('Missing required L3 test evidence for PR creation in step 4');

      // Verify ticket flagged as Blocked in ADO
      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const patchDoc = mockWitApi.updateWorkItem.mock.calls[0].find((arg: any) => Array.isArray(arg));
      expect(patchDoc).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Blocked' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[contract-conflict]'),
          }),
        ])
      );

      // Verify PR was NOT created
      expect(createOrGetPullRequest).not.toHaveBeenCalled();
    });

    it('creates PR and records real L2 evidence when step 4 has valid L3 evidence', async () => {
      const workItemId = 902;
      const revId = 4;

      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.l3Evidence = [
            {
              revId: 3,
              testSuite: 'vitest',
              totalTests: 12,
              passed: 12,
              failed: 0,
              durationMs: 320,
              coverageSummary: '94%',
              gitDiffStat: '3 files changed, 45 insertions(+)',
              createdAt: new Date().toISOString(),
            },
          ];
        });
      });

      stateStore.recordDedupEvent(workItemId, revId, 'hash-902-4');

      mockWitApi.getWorkItem.mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Feature with valid tests',
          'System.State': 'Dev Done',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'AC details',
        },
      });

      mockWitApi.getRevision.mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Feature with valid tests',
          'System.State': 'Dev Done',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'AC details',
        },
      });

      await routeWorkItemEvent(workItemId, revId);

      // PR was created
      expect(createOrGetPullRequest).toHaveBeenCalledTimes(1);

      // L2 evidence was recorded on the ticket
      const ticket = await stateStore.getTicketState(workItemId);
      expect(ticket?.l2Evidence).toBeDefined();
      expect(ticket?.l2Evidence?.reviewPassed).toBe(true);
      expect(ticket?.l2Evidence?.qualityNotes).toContain('12/12 passed');
    });
  });

  describe('QA Worker - Real Commit SHA Resolution', () => {
    it('resolves real commit SHA from worktree via rev-parse HEAD', async () => {
      const workItemId = 903;

      mockWitApi.getWorkItem.mockResolvedValue({
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'QA verification test',
          'System.State': 'Ready for QA',
          'System.Tags': '[pr-merged]',
        },
      });

      // Spy on createWorktree
      vi.spyOn(worktreeModule, 'createWorktree').mockResolvedValue({
        worktreePath: harness.tempDir,
        branchName: 'task/ticket-903-qa-verification-test',
      });
      vi.spyOn(worktreeModule, 'cleanupWorktree').mockResolvedValue();

      // Return mock git with resolved commit SHA
      vi.mocked(simpleGit).mockReturnValue({
        raw: vi.fn().mockImplementation(async (args: string[]) => {
          if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
            return 'fedcba0987654321fedcba0987654321fedcba09\n';
          }
          return '';
        }),
      } as any);

      const mockRunner = vi.fn().mockResolvedValue({
        passed: true,
        exitCode: 0,
        stdout: 'Tests 5 passed (5)',
        stderr: '',
        durationMs: 1500,
        failures: [],
        parsedSummary: { totalTests: 5, passed: 5, failed: 0 },
      });

      const result = await processQaVerification(workItemId, { mockRunner });
      expect(result?.outcome).toBe('passed');

      const ticket = await stateStore.getTicketState(workItemId);
      expect(ticket?.qaEvidence?.commitSha).toBe('fedcba0987654321fedcba0987654321fedcba09');
      expect(ticket?.qaEvidence?.commitSha).not.toBe('main');
    });

    it('fails closed and flags ticket Blocked with [qa-harness-error] when commit SHA cannot be resolved', async () => {
      const workItemId = 904;

      mockWitApi.getWorkItem.mockResolvedValue({
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'QA failure test',
          'System.State': 'Ready for QA',
          'System.Tags': '[pr-merged]',
        },
      });

      vi.spyOn(worktreeModule, 'createWorktree').mockRejectedValue(new Error('Worktree attach failed'));

      // Both worktree and branch rev-parse fail
      vi.mocked(simpleGit).mockReturnValue({
        raw: vi.fn().mockRejectedValue(new Error('fatal: not a valid object name HEAD')),
      } as any);

      const mockRunner = vi.fn();
      await processQaVerification(workItemId, { mockRunner });

      // Runner should never be called
      expect(mockRunner).not.toHaveBeenCalled();

      // Ticket must be flagged Blocked with [qa-harness-error]
      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const patchDoc = mockWitApi.updateWorkItem.mock.calls[0].find((arg: any) => Array.isArray(arg));
      expect(patchDoc).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Blocked' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[qa-harness-error]'),
          }),
        ])
      );
    });
  });

  describe('Evidence Index - Zero Fabricated Defaults (CORE-04)', () => {
    async function seedBaseTicket(workItemId: number) {
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.auditLogs = [
            {
              revId: 1,
              verdict: 'passed',
              reasons: JSON.stringify(['DoD complete']),
              criteriaSummary: 'DoD Criteria complete',
              model: 'gpt-4o',
              evaluatedAt: new Date().toISOString(),
            },
          ];
          draft.l2Evidence = {
            reviewPassed: true,
            qualityNotes: 'PR approved by peer reviewer',
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
            policiesSummary: 'SAST green; assertions immutable',
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
              takeaways: 'Deployment verified',
              actionItems: ['Monitor latency'],
              createdAt: new Date().toISOString(),
            },
          ];
        });
      });
    }

    it('throws MissingEvidenceError for L2 when l2Evidence is missing under failClosed: true', async () => {
      const workItemId = 905;
      await seedBaseTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.l2Evidence = null;
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L2',
      });
    });

    it('throws MissingEvidenceError for L4 when l4Evidence is missing under failClosed: true', async () => {
      const workItemId = 906;
      await seedBaseTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.l4Evidence = null;
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L4',
      });
    });

    it('throws MissingEvidenceError for L6 when errorRate is missing or empty under failClosed: true', async () => {
      const workItemId = 907;
      await seedBaseTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.telemetryEvaluations = [
            {
              windowMinutes: 30,
              errorRate: '',
              p95LatencyMs: 120,
              breached: 0,
              evaluatedAt: new Date().toISOString(),
            },
          ];
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L6',
      });
    });

    it('throws MissingEvidenceError for L6 when p95LatencyMs is missing or null under failClosed: true', async () => {
      const workItemId = 908;
      await seedBaseTicket(workItemId);
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.telemetryEvaluations = [
            {
              windowMinutes: 30,
              errorRate: '0.01%',
              p95LatencyMs: null as any,
              breached: 0,
              evaluatedAt: new Date().toISOString(),
            },
          ];
        });
      });

      await expect(
        compileL1L7EvidenceIndex(workItemId, { failClosed: true })
      ).rejects.toMatchObject({
        name: 'MissingEvidenceError',
        level: 'L6',
      });
    });

    it('does not fabricate constants (0.05% or 145) when failClosed is false and metrics are missing', async () => {
      const workItemId = 909;
      await workItemQueueManager.runInLane(workItemId, async () => {
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.auditLogs = [];
          draft.l2Evidence = null;
          draft.l3Evidence = [];
          draft.l4Evidence = null;
          draft.deploymentRecords = [];
          draft.telemetryEvaluations = [];
        });
      });

      const summary = await compileL1L7EvidenceIndex(workItemId, { failClosed: false });

      expect(summary.l2.reviewPassed).toBe(false);
      expect(summary.l2.qualityNotes).toContain('Pending');

      expect(summary.l4.securityPassed).toBe(false);
      expect(summary.l4.policiesSummary).toContain('Pending');

      expect(summary.l6.errorRate).toBe('Pending');
      expect(summary.l6.errorRate).not.toBe('0.05%');
      expect(summary.l6.p95LatencyMs).toBe(0);
      expect(summary.l6.p95LatencyMs).not.toBe(145);
    });
  });
});
