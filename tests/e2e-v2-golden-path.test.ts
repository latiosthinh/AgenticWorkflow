import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { adoClient } from '../src/ado/client.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { processWorkItemExecute } from '../src/execute/worker.js';
import { createOrGetPullRequest } from '../src/ado/git.js';
import { processQaVerification } from '../src/qa/worker.js';
import {
  processDeploymentPreparation,
  processDeploymentWorkflow,
} from '../src/deploy/worker.js';
import { recordL3Evidence } from '../src/test-runner/evidence.js';
import { compileL1L7EvidenceIndex } from '../src/deploy/evidence-index.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';

// Mock downstream workers to keep E2E focused on routing & StateStore evidence integration
vi.mock('../src/execute/worker.js', () => ({
  processWorkItemExecute: vi.fn().mockImplementation(async (id: number, rev: number) => {
    stateStore.updateDedupStatus(id, rev, 'completed');
  }),
}));

vi.mock('../src/ado/git.js', () => ({
  createOrGetPullRequest: vi.fn().mockResolvedValue({
    pullRequestId: 991,
    title: 'AB#9901 - E2E Golden Path Feature',
    sourceRefName: 'refs/heads/task/ticket-9901-e2e-golden-path-feature',
    targetRefName: 'refs/heads/main',
  }),
  getPullRequest: vi.fn(),
}));

vi.mock('../src/qa/worker.js', () => ({
  processQaVerification: vi.fn().mockImplementation(async (id: number) => {
    await workItemQueueManager.runInLane(id, async () => {
      await stateStore.updateTicketState(id, (draft) => {
        draft.qaEvidence = {
          totalTests: 12,
          passedCount: 12,
          failedCount: 0,
          durationMs: 450,
          commitSha: 'beefcafe1234',
          stagingUrl: 'https://staging.internal.net',
          flakeCleared: 0,
          createdAt: new Date().toISOString(),
        };
      });
    });
  }),
}));

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
          'System.History': '',
        },
      },
      2: {
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
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
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'In Dev',
          'System.Tags': 'backend; [scope-locked]',
          'System.History': '',
        },
      },
      4: {
        id: workItemId,
        rev: 4,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'Dev Done',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'System.History': '',
        },
      },
      5: {
        id: workItemId,
        rev: 5,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
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
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'Ready for QA',
          'System.Tags': 'backend; [acceptance-approved]; [pr-merged]',
          'System.History': '',
        },
      },
      7: {
        id: workItemId,
        rev: 7,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'Ready to Deploy',
          'System.Tags': 'backend; [qa-verified]',
          'System.History': '',
        },
      },
      8: {
        id: workItemId,
        rev: 8,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'Ready to Deploy',
          'System.Tags': 'backend; [qa-verified]; [deploying]',
          'System.History': '',
        },
      },
      9: {
        id: workItemId,
        rev: 9,
        fields: {
          'System.Title': 'E2E Golden Path Feature',
          'System.Description': 'E2E verification of 9-step Golden Path v2 pipeline.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'Done',
          'System.Tags': 'backend; [golden-path-complete]',
          'System.History': '',
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

    const updateSpy = vi.spyOn(adoClient, 'updateWorkItem');

    // =========================================================================
    // Step 1 (REFINEMENT): Ticket & AC verify (⚡ AI) -> New + [awaiting-scope-lock]
    // =========================================================================
    currentRev = 1;
    await routeWorkItemEvent(workItemId, 1);

    const ticketRev1 = await stateStore.getTicketState(workItemId);
    expect(ticketRev1).not.toBeNull();
    expect(ticketRev1?.auditLogs.length).toBe(1);
    expect(ticketRev1?.auditLogs[0].verdict).toBe('passed');
    expect(ticketRev1?.scopeLock?.status).toBe('pending');
    expect(updateSpy).toHaveBeenCalledWith(
      workItemId,
      expect.arrayContaining([
        expect.objectContaining({
          path: '/fields/System.Tags',
          value: expect.stringContaining('[awaiting-scope-lock]'),
        }),
      ])
    );

    // =========================================================================
    // Step 2 (REFINEMENT): Scope review & verify (👤 PM) -> Ready to Dev + [scope-locked]
    // =========================================================================
    currentRev = 2;
    await routeWorkItemEvent(workItemId, 2);

    const ticketRev2 = await stateStore.getTicketState(workItemId);
    expect(ticketRev2?.scopeLock?.status).toBe('locked');
    expect(updateSpy).toHaveBeenCalledWith(
      workItemId,
      expect.arrayContaining([
        expect.objectContaining({ path: '/fields/System.State', value: 'Ready to Dev' }),
        expect.objectContaining({
          path: '/fields/System.Tags',
          value: expect.stringContaining('[scope-locked]'),
        }),
      ])
    );

    // =========================================================================
    // Step 3 (EXECUTION): Loop: Plan-Code-Test (⚡ AI) -> In Dev
    // =========================================================================
    currentRev = 3;
    await routeWorkItemEvent(workItemId, 3);
    expect(processWorkItemExecute).toHaveBeenCalledWith(workItemId, 3, undefined);

    // Record L3 test evidence in StateStore as required for fail-closed checks
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

    const ticketRev3 = await stateStore.getTicketState(workItemId);
    expect(ticketRev3?.l3Evidence.length).toBe(1);
    expect(ticketRev3?.l3Evidence[0].passed).toBe(8);

    // =========================================================================
    // Step 4 (EXECUTION): Dev validate & PR (👤 Dev) -> Dev Done + [awaiting-acceptance]
    // =========================================================================
    currentRev = 4;
    await routeWorkItemEvent(workItemId, 4);
    expect(createOrGetPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId,
        sourceBranch: expect.stringContaining('task/ticket-9901'),
      })
    );

    // =========================================================================
    // Step 5 (ACCEPTANCE): PR review & CI deploy (👤 TechLead/SA) -> Dev Done + [acceptance-approved]
    // =========================================================================
    currentRev = 5;
    await routeWorkItemEvent(workItemId, 5);
    expect(updateSpy).toHaveBeenCalledWith(
      workItemId,
      expect.arrayContaining([
        expect.objectContaining({
          path: '/fields/System.Tags',
          value: expect.stringContaining('[acceptance-approved]'),
        }),
      ])
    );

    // PR merge transitions work item to 'Ready for QA' before QA trigger
    revisions[5].fields['System.State'] = 'Ready for QA';
    revisions[5].fields['System.Tags'] = 'backend; [acceptance-approved]; [pr-merged]';

    // =========================================================================
    // Step 6 (ACCEPTANCE): QA staging verify (👤 QA) -> Ready for QA -> QA evidence
    // =========================================================================
    currentRev = 6;
    await routeWorkItemEvent(workItemId, 6);
    expect(processQaVerification).toHaveBeenCalledWith(workItemId, undefined);

    const ticketRev6 = await stateStore.getTicketState(workItemId);
    expect(ticketRev6?.qaEvidence).toBeDefined();
    expect(ticketRev6?.qaEvidence?.passedCount).toBe(12);

    // =========================================================================
    // Step 7 (RELEASE): Release approval + deploy (👤 QA/SA/Lead/PM) -> L5 Packet
    // =========================================================================
    currentRev = 7;
    await processDeploymentPreparation(workItemId, {
      commitSha: 'beefcafe1234',
      environmentName: 'Production',
    });

    const ticketRev7 = await stateStore.getTicketState(workItemId);
    expect(ticketRev7?.deploymentRecords.length).toBe(1);
    expect(ticketRev7?.deploymentRecords[0].status).toBe('pending_approval');
    expect(ticketRev7?.deploymentRecords[0].environmentName).toBe('Production');

    // =========================================================================
    // Step 8 (RELEASE) & Step 9 (RETRO): Smoke + Monitor -> Retro -> Done (⚡ AI & Team)
    // =========================================================================
    currentRev = 8;
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
      gateFriction: {
        scopeRejections: 0,
        reworkBounces: 0,
        qaStrikes: 0,
        smokeFlakes: 0,
      },
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
      skipPreparation: true,
      mockSmokeResult: { outcome: 'passed' as const },
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

    await processDeploymentWorkflow(workItemId, 8, deployOptions);

    // =========================================================================
    // Assert Complete Golden Path v2 Invariants & Archive Integrity
    // =========================================================================
    const tickets = await stateStore.listTickets({ includeArchived: true });
    const ticket = tickets.find((t) => t.workItemId === workItemId);
    expect(ticket).toBeDefined();

    // 1. All 7 evidence tiers are non-null in StateStore
    expect(ticket?.auditLogs.length).toBeGreaterThan(0); // L1
    expect(ticket?.auditLogs[0].verdict).toBe('passed');
    expect(ticket?.scopeLock?.status).toBe('locked'); // L1 scope
    expect(ticket?.l3Evidence.length).toBeGreaterThan(0); // L2/L3
    expect(ticket?.qaEvidence).toBeDefined(); // L3/L5
    expect(ticket?.deploymentRecords.length).toBeGreaterThan(0); // L5
    expect(ticket?.smokeEvidence?.status).toBe('passed'); // L6 smoke
    expect(ticket?.telemetryEvaluations.length).toBeGreaterThan(0); // L6 telemetry
    expect(ticket?.retroRecords.length).toBeGreaterThan(0); // L7 retro
    expect(ticket?.l7Evidence).toBeDefined(); // L7

    // 2. Fail-closed evidence index compiler succeeds with all levels populated
    const index = await compileL1L7EvidenceIndex(workItemId, { failClosed: true });
    expect(index.workItemId).toBe(workItemId);
    expect(index.l1.verdict).toBe('PASSED');
    expect(index.l2.reviewPassed).toBe(true);
    expect(index.l3.localTestsPassed).toBe(8);
    expect(index.l3.qaTestsPassed).toBe(12);
    expect(index.l4.securityPassed).toBe(true);
    expect(index.l5.status).toBe('deployed');
    expect(index.l6.smokePassed).toBe(true);
    expect(index.l6.breached).toBe(false);
    expect(index.l7).toBeDefined();
    expect(index.l7?.takeaways).toContain('Deployment verified and stable');
    expect(index.l7?.actionItems[0]).toContain('Observe post-deploy telemetry');

    // 3. ADO update includes System.State: Done and [golden-path-complete] tag
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

    // 4. Archive file exists and contains retro takeaways and action items
    const archivePath = path.join(harness.tempDir, 'archive', `${workItemId}.md`);
    expect(fs.existsSync(archivePath)).toBe(true);
    const archiveContent = fs.readFileSync(archivePath, 'utf8');
    expect(archiveContent).toContain('Deployment verified and stable across all release gates');
    expect(archiveContent).toContain('Observe post-deploy telemetry');
  });
});
