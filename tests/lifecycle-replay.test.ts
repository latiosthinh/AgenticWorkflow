import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { adoClient } from '../src/ado/client.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { processWorkItemExecute } from '../src/execute/worker.js';
import { createOrGetPullRequest } from '../src/ado/git.js';
import { processQaVerification } from '../src/qa/worker.js';
import { processDeploymentWorkflow } from '../src/deploy/worker.js';
import { evaluateCircuitBreaker, resetCircuitBreaker } from '../src/accept/breaker.js';
import { processWorkItemRework } from '../src/execute/rework-worker.js';

// Mock downstream workers to verify pure router dispatch and options forwarding
vi.mock('../src/execute/worker.js', () => ({
  processWorkItemExecute: vi.fn(),
}));

vi.mock('../src/execute/rework-worker.js', () => ({
  processWorkItemRework: vi.fn(),
}));

vi.mock('../src/accept/breaker.js', () => ({
  evaluateCircuitBreaker: vi.fn(),
  resetCircuitBreaker: vi.fn(),
}));

vi.mock('../src/ado/git.js', () => ({
  createOrGetPullRequest: vi.fn().mockResolvedValue({
    pullRequestId: 555,
    title: 'AB#9001 - Replay Test Feature',
    sourceRefName: 'refs/heads/task/ticket-9001-replay-test-feature',
    targetRefName: 'refs/heads/main',
  }),
  getPullRequest: vi.fn(),
}));

vi.mock('../src/qa/worker.js', () => ({
  processQaVerification: vi.fn(),
}));

vi.mock('../src/deploy/worker.js', () => ({
  processDeploymentWorkflow: vi.fn(),
}));

describe('V1 Lifecycle Replay Parity Test (TAX-03)', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    adoClient.setWorkItemTrackingApi(null);
    vi.restoreAllMocks();

    // Default mock implementations
    vi.mocked(processWorkItemExecute).mockImplementation(async (id: number, rev: number) => {
      stateStore.updateDedupStatus(id, rev, 'completed');
    });

    vi.mocked(processQaVerification).mockResolvedValue(undefined);
    vi.mocked(processDeploymentWorkflow).mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
  });

  it('drives work item through full lifecycle New -> Ready to Dev -> In Dev -> Dev Done -> Ready for QA -> Ready to Deploy -> Done with exact v1.0 parity', async () => {
    const workItemId = 9001;

    let currentRev = 1;
    const revisions: Record<number, any> = {
      1: {
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'Replay Test Feature',
          'System.Description': 'Description for feature verification.',
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
          'System.Title': 'Replay Test Feature',
          'System.Description': 'Description for feature verification.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'Ready to Dev',
          'System.Tags': 'backend; [awaiting-scope-lock]',
          'System.History': '',
        },
      },
      3: {
        id: workItemId,
        rev: 3,
        fields: {
          'System.Title': 'Replay Test Feature',
          'System.Description': 'Description for feature verification.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
          'System.History': '',
        },
      },
      4: {
        id: workItemId,
        rev: 4,
        fields: {
          'System.Title': 'Replay Test Feature',
          'System.Description': 'Description for feature verification.',
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
          'System.Title': 'Replay Test Feature',
          'System.Description': 'Description for feature verification.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'Dev Done',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'System.History': 'Developer completed review [approve-acceptance] ready for QA verification',
        },
      },
      6: {
        id: workItemId,
        rev: 6,
        fields: {
          'System.Title': 'Replay Test Feature',
          'System.Description': 'Description for feature verification.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid input, return 200 response and verified payload. System actor test condition.',
          'System.State': 'Ready for QA',
          'System.Tags': 'backend; [acceptance-approved]',
          'System.History': '',
        },
      },
      7: {
        id: workItemId,
        rev: 7,
        fields: {
          'System.Title': 'Replay Test Feature',
          'System.Description': 'Description for feature verification.',
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
          'System.Title': 'Replay Test Feature',
          'System.Description': 'Description for feature verification.',
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

    // 1. Revision 1: State 'New' -> calls audit worker -> marks dedup completed
    currentRev = 1;
    stateStore.recordDedupEvent(workItemId, currentRev, `hash-${currentRev}`);
    await routeWorkItemEvent(workItemId, currentRev);

    const dedupRev1 = stateStore.getDedupEvent(workItemId, currentRev);
    expect(dedupRev1?.status).toBe('completed');
    const ticketStateRev1 = await stateStore.getTicketState(workItemId);
    expect(ticketStateRev1).toBeDefined();
    expect(ticketStateRev1?.auditLogs).toHaveLength(1);
    expect(ticketStateRev1?.auditLogs[0].verdict).toBe('passed');

    // 2. Revision 2: State 'Ready to Dev' -> unhandled in router (human PM scope gate) -> marks dedup skipped
    currentRev = 2;
    stateStore.recordDedupEvent(workItemId, currentRev, `hash-${currentRev}`);
    await routeWorkItemEvent(workItemId, currentRev);

    const dedupRev2 = stateStore.getDedupEvent(workItemId, currentRev);
    expect(dedupRev2?.status).toBe('skipped');
    expect(dedupRev2?.errorMessage).toBe("Ticket state 'Ready to Dev' has no active handler");

    // 3. Revision 3: State 'In Dev' -> calls execution worker -> options forwarded
    currentRev = 3;
    stateStore.recordDedupEvent(workItemId, currentRev, `hash-${currentRev}`);
    const executeOptions = { maxDiffLoc: 200, mockCodeEdit: vi.fn() };
    await routeWorkItemEvent(workItemId, currentRev, executeOptions);

    expect(processWorkItemExecute).toHaveBeenCalledWith(workItemId, currentRev, executeOptions);
    const dedupRev3 = stateStore.getDedupEvent(workItemId, currentRev);
    expect(dedupRev3?.status).toBe('completed');

    // 4. Revision 4: State 'Dev Done' -> calls PR creation -> marks dedup completed
    currentRev = 4;
    stateStore.recordDedupEvent(workItemId, currentRev, `hash-${currentRev}`);
    await routeWorkItemEvent(workItemId, currentRev);

    expect(createOrGetPullRequest).toHaveBeenCalledTimes(1);
    expect(createOrGetPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId,
        title: 'Replay Test Feature',
        sourceBranch: 'task/ticket-9001-replay-test-feature',
      })
    );
    const dedupRev4 = stateStore.getDedupEvent(workItemId, currentRev);
    expect(dedupRev4?.status).toBe('completed');

    // 5. Revision 5: State 'Dev Done' with history '[approve-acceptance]' -> acceptance verdict takes precedence -> tags updated
    currentRev = 5;
    stateStore.recordDedupEvent(workItemId, currentRev, `hash-${currentRev}`);
    await routeWorkItemEvent(workItemId, currentRev);

    // PR creation should NOT have been called a second time
    expect(createOrGetPullRequest).toHaveBeenCalledTimes(1);
    expect(mockWitApi.updateWorkItem).toHaveBeenCalled();
    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    const lastUpdateCall = updateCalls[updateCalls.length - 1];
    const patch = lastUpdateCall.find((arg: any) => Array.isArray(arg));
    expect(patch).toBeDefined();
    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp.value).toContain('[acceptance-approved]');

    const dedupRev5 = stateStore.getDedupEvent(workItemId, currentRev);
    expect(dedupRev5?.status).toBe('completed');

    // PR merge transitions work item to 'Ready for QA' before QA trigger
    revisions[5].fields['System.State'] = 'Ready for QA';
    revisions[5].fields['System.Tags'] = 'backend; [acceptance-approved]; [pr-merged]';

    // 6. Revision 6: State 'Ready for QA' -> calls QA worker -> marks dedup completed
    currentRev = 6;
    stateStore.recordDedupEvent(workItemId, currentRev, `hash-${currentRev}`);
    const qaOptions = { stagingUrl: 'https://qa-staging.local' };
    await routeWorkItemEvent(workItemId, currentRev, qaOptions);

    expect(processQaVerification).toHaveBeenCalledWith(workItemId, qaOptions);
    const dedupRev6 = stateStore.getDedupEvent(workItemId, currentRev);
    expect(dedupRev6?.status).toBe('completed');

    // 7. Revision 7: State 'Ready to Deploy' -> calls deploy worker -> marks dedup completed
    currentRev = 7;
    stateStore.recordDedupEvent(workItemId, currentRev, `hash-${currentRev}`);
    const deployOptions = { environmentName: 'Staging-Production' };
    await routeWorkItemEvent(workItemId, currentRev, deployOptions);

    expect(processDeploymentWorkflow).toHaveBeenCalledWith(workItemId, currentRev, deployOptions);
    const dedupRev7 = stateStore.getDedupEvent(workItemId, currentRev);
    expect(dedupRev7?.status).toBe('completed');

    // 8. Revision 8: State 'Done' -> unhandled in router (terminal state) -> marks dedup skipped
    currentRev = 8;
    stateStore.recordDedupEvent(workItemId, currentRev, `hash-${currentRev}`);
    await routeWorkItemEvent(workItemId, currentRev);

    const dedupRev8 = stateStore.getDedupEvent(workItemId, currentRev);
    expect(dedupRev8?.status).toBe('skipped');
    expect(dedupRev8?.errorMessage).toBe("Ticket state 'Done' has no active handler");
  });

  it('routes tickets with [awaiting-input] tag to execution worker (Step 3) regardless of non-In-Dev state', async () => {
    const workItemId = 9002;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Ticket Resuming From Question',
          'System.State': 'Ready to Dev',
          'System.Tags': 'backend; [awaiting-input]',
        },
      }),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9002');
    await routeWorkItemEvent(workItemId, revId);

    expect(processWorkItemExecute).toHaveBeenCalledWith(workItemId, revId, undefined);
    expect(stateStore.getDedupEvent(workItemId, revId)?.status).toBe('completed');
  });

  it('marks dedup skipped when state is not recognized by taxonomy', async () => {
    const workItemId = 9003;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Exotic State Ticket',
          'System.State': 'Under Review',
        },
      }),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9003');
    await routeWorkItemEvent(workItemId, revId);

    const dedup = stateStore.getDedupEvent(workItemId, revId);
    expect(dedup?.status).toBe('skipped');
    expect(dedup?.errorMessage).toBe("Ticket state 'Under Review' has no active handler");
  });

  it('records failed dedup status and rethrows when ADO client throws unhandled error', async () => {
    const workItemId = 9004;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockRejectedValue(new Error('ADO Service Unavailable 503')),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9004');

    await expect(routeWorkItemEvent(workItemId, revId)).rejects.toThrow('ADO Service Unavailable 503');

    const dedup = stateStore.getDedupEvent(workItemId, revId);
    expect(dedup?.status).toBe('failed');
    expect(dedup?.errorMessage).toContain('ADO Service Unavailable 503');
  });

  it('evaluates reset_rework verdict with precedence over state routing and resets circuit breaker', async () => {
    const workItemId = 9005;
    const revId = 2;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Reset Rework Test',
          'System.State': 'In Dev',
          'System.History': 'Resetting breaker counter [reset-rework]',
        },
      }),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9005');
    await routeWorkItemEvent(workItemId, revId);

    expect(resetCircuitBreaker).toHaveBeenCalledWith(workItemId);
    expect(stateStore.getDedupEvent(workItemId, revId)?.status).toBe('completed');
    // Ensure execution worker was not invoked
    expect(processWorkItemExecute).not.toHaveBeenCalled();
  });

  it('evaluates reject verdict with precedence over state routing and dispatches rework worker', async () => {
    const workItemId = 9006;
    const revId = 2;

    vi.mocked(evaluateCircuitBreaker).mockResolvedValueOnce({
      allowed: true,
      currentCount: 1,
      maxAllowed: 2,
    });

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Reject Rework Test',
          'System.State': 'Dev Done',
          'System.History': 'Please fix validation error [reject-acceptance]',
        },
      }),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9006');
    const reworkOptions = { maxDiffLoc: 250 };
    await routeWorkItemEvent(workItemId, revId, reworkOptions);

    expect(evaluateCircuitBreaker).toHaveBeenCalledWith(workItemId, 'accept');
    expect(processWorkItemRework).toHaveBeenCalledWith(
      workItemId,
      revId,
      'Please fix validation error',
      reworkOptions
    );
    // Ensure PR creation on Dev Done was bypassed because rejection took precedence
    expect(createOrGetPullRequest).not.toHaveBeenCalled();
  });
});
