import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import type { ScopeLockState, TicketState } from '../src/state/types.js';
import {
  formatScopeReviewPacketComment,
  buildParkScopeLockPatch,
  type ScopePacketData,
} from '../src/scope/packet.js';
import { detectScopeVerdict } from '../src/scope/verdict.js';
import {
  evaluateScopeBreaker,
  resetScopeBreaker,
  handleScopeApproval,
  handleScopeRejection,
  handleScopeReset,
  buildScopeApprovedPatch,
  buildScopeEscalationPatch,
  buildScopeResetPatch,
} from '../src/scope/gate.js';
import {
  checkScopeLockTimeouts,
  startScopeWatchdog,
  TWENTY_FOUR_HOURS_MS,
  SEVENTY_TWO_HOURS_MS,
} from '../src/scope/watchdog.js';
import { processWorkItemAudit } from '../src/auditor/worker.js';
import { adoClient } from '../src/ado/client.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { processWorkItemExecute } from '../src/execute/worker.js';

vi.mock('../src/execute/worker.js', () => ({
  processWorkItemExecute: vi.fn(),
}));

describe('PM Scope-Lock Gate - Packet & Schema (Task 1)', () => {
  it('defines ScopeLockState type contract with all required lifecycle properties', () => {
    const scopeLock: ScopeLockState = {
      status: 'pending',
      iterationCount: 0,
      requestedAt: '2026-09-17T00:00:00.000Z',
      lockedAt: null,
      lockedBy: null,
      feedback: null,
      remindedAt: null,
      escalatedAt: null,
      createdAt: '2026-09-17T00:00:00.000Z',
      updatedAt: '2026-09-17T00:00:00.000Z',
    };

    expect(scopeLock.status).toBe('pending');
    expect(scopeLock.iterationCount).toBe(0);

    const ticketPartial: Partial<TicketState> = {
      workItemId: 1001,
      scopeLock,
    };
    expect(ticketPartial.scopeLock?.status).toBe('pending');
  });

  it('formatScopeReviewPacketComment generates sanitized HTML with DoD checklist, actions, and bot shield', () => {
    const data: ScopePacketData = {
      workItemId: 1001,
      title: 'User Authentication Endpoint',
      criteriaSummary: 'Verified 3 acceptance criteria with given-when-then syntax.',
      reasons: ['Valid criteria format', 'System actor verified'],
    };

    const html = formatScopeReviewPacketComment(data);

    // Header and status table
    expect(html).toContain('[Scope Review Packet] L1 Audit Contract Passed');
    expect(html).toContain('AWAITING PM SCOPE LOCK');
    expect(html).toContain('Verified 3 acceptance criteria with given-when-then syntax.');

    // DoD collapsible section & PM actions
    expect(html).toContain('Scope Review Instructions &amp; Definition of Done');
    expect(html).toContain('[approve-scope]');
    expect(html).toContain('[reject-scope]');
    expect(html).toContain('[reset-scope]');

    // Loop shield marker
    expect(html).toContain('<!-- [automated-agent] -->');

    // Security: ensure script or iframe tags are stripped
    const maliciousData: ScopePacketData = {
      workItemId: 1002,
      title: 'Malicious Ticket',
      criteriaSummary: '<script>alert(1)</script><iframe src="evil.com"></iframe>Safe criteria',
      reasons: ['<script>evil()</script>'],
    };
    const sanitizedHtml = formatScopeReviewPacketComment(maliciousData);
    expect(sanitizedHtml).not.toContain('<script>');
    expect(sanitizedHtml).not.toContain('<iframe>');
    expect(sanitizedHtml).toContain('Safe criteria');
  });

  it('buildParkScopeLockPatch builds JSON patch appending tags and history without touching System.State', () => {
    const comment = '<p>Review packet</p>\n<!-- [automated-agent] -->';
    const currentTags = 'backend; high-priority';

    const patch = buildParkScopeLockPatch(comment, currentTags);

    // Must not touch System.State
    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toBeUndefined();

    // Must contain tag operation with both tags appended
    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp.value).toContain('backend');
    expect(tagOp.value).toContain('high-priority');
    expect(tagOp.value).toContain('[awaiting-scope-lock]');
    expect(tagOp.value).toContain('[audit-passed]');

    // Must contain System.History add operation
    const historyOp = patch.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.op).toBe(Operation.Add);
    expect(historyOp.value).toBe(comment);
  });
});

describe('PM Scope-Lock Gate - Auditor Worker & Idempotency (Task 2)', () => {
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
    const workItemId = 2001;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Payment Webhook Handler',
          'System.Description': 'System handles stripe webhook events.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid signature, return 200 and process event. System actor verified.',
          'System.State': 'New',
          'System.Tags': 'payments',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi as any);
    stateStore.recordDedupEvent(workItemId, revId, 'hash-2001');

    await workItemQueueManager.runInLane(workItemId, () =>
      processWorkItemAudit(workItemId, revId)
    );

    // Verify ADO update was invoked with parking patch
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    // Verify System.State is NOT replaced
    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toBeUndefined();

    // Verify tags include [awaiting-scope-lock] and [audit-passed]
    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp.value).toContain('payments');
    expect(tagOp.value).toContain('[awaiting-scope-lock]');
    expect(tagOp.value).toContain('[audit-passed]');

    // Verify comment contains review packet
    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Scope Review Packet]');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    // Verify StateStore ticket state has scopeLock initialized
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket).toBeDefined();
    expect(ticket?.auditLogs).toHaveLength(1);
    expect(ticket?.auditLogs[0].verdict).toBe('passed');
    expect(ticket?.scopeLock).toBeDefined();
    expect(ticket?.scopeLock?.status).toBe('pending');
    expect(ticket?.scopeLock?.iterationCount).toBe(0);
    expect(ticket?.scopeLock?.requestedAt).toBeDefined();
  });

  it('SCOPE-03 bypass: skips re-audit when ticket is already parked awaiting scope lock or locked', async () => {
    const workItemId = 2002;
    const revId = 2;

    // Case A: Parked ticket with tag [awaiting-scope-lock]
    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Already Parked Ticket',
          'System.Description': 'Description',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Given x when y then z',
          'System.State': 'New',
          'System.Tags': 'payments; [awaiting-scope-lock]; [audit-passed]',
        },
      }),
      updateWorkItem: vi.fn(),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi as any);
    stateStore.recordDedupEvent(workItemId, revId, 'hash-2002');

    await workItemQueueManager.runInLane(workItemId, () =>
      processWorkItemAudit(workItemId, revId)
    );

    // Should skip re-audit: 0 ADO updates
    expect(mockWitApi.updateWorkItem).not.toHaveBeenCalled();

    // Verify dedup record is skipped
    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(dedup.status).toBe('skipped');
    expect(dedup.errorMessage).toContain('parked awaiting scope lock or already locked');

    // Case B: Ticket with StateStore scopeLock status 'locked'
    const workItemIdLocked = 2003;
    const revIdLocked = 1;

    await workItemQueueManager.runInLane(workItemIdLocked, async () => {
      await stateStore.updateTicketState(workItemIdLocked, (draft) => {
        const now = new Date().toISOString();
        draft.scopeLock = {
          status: 'locked',
          iterationCount: 1,
          requestedAt: now,
          lockedAt: now,
          lockedBy: 'pm@example.com',
          feedback: null,
          remindedAt: null,
          escalatedAt: null,
          createdAt: now,
          updatedAt: now,
        };
      });
    });

    const mockWitApiLocked = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemIdLocked,
        rev: revIdLocked,
        fields: {
          'System.Title': 'Locked Ticket in New',
          'System.Description': 'Description',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Given x when y then z',
          'System.State': 'New',
        },
      }),
      updateWorkItem: vi.fn(),
    };

    adoClient.setWorkItemTrackingApi(mockWitApiLocked as any);
    stateStore.recordDedupEvent(workItemIdLocked, revIdLocked, 'hash-2003');

    await workItemQueueManager.runInLane(workItemIdLocked, () =>
      processWorkItemAudit(workItemIdLocked, revIdLocked)
    );

    expect(mockWitApiLocked.updateWorkItem).not.toHaveBeenCalled();
    const markerLocked = JSON.parse(
      fs.readFileSync(
        path.join(harness.tempDir, 'dedup', `${workItemIdLocked}-${revIdLocked}.json`),
        'utf8'
      )
    );
    expect(markerLocked.status).toBe('skipped');
  });

  it('SCOPE-03 bypass: three consecutive revisions produce exactly one audit record and zero duplicate transitions', async () => {
    const workItemId = 2004;

    const mockWitApi = {
      getWorkItem: vi.fn(),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    // Revision 1: Brand new ticket
    mockWitApi.getWorkItem.mockResolvedValueOnce({
      id: workItemId,
      rev: 1,
      fields: {
        'System.Title': 'Batch Processing Job',
        'System.Description': 'Processes daily transactions.',
        'Microsoft.VSTS.Common.AcceptanceCriteria':
          'Given batch of records, return 200 and process job. System actor verified.',
        'System.State': 'New',
        'System.Tags': 'batch',
      },
    });

    stateStore.recordDedupEvent(workItemId, 1, 'hash-rev-1');
    await workItemQueueManager.runInLane(workItemId, () =>
      processWorkItemAudit(workItemId, 1)
    );

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);

    // Revision 2: Subsequent update (e.g. comment added by team member)
    mockWitApi.getWorkItem.mockResolvedValueOnce({
      id: workItemId,
      rev: 2,
      fields: {
        'System.Title': 'Batch Processing Job',
        'System.Description': 'Processes daily transactions.',
        'Microsoft.VSTS.Common.AcceptanceCriteria':
          'Given batch of records, return 200 and process job. System actor verified.',
        'System.State': 'New',
        'System.Tags': 'batch; [awaiting-scope-lock]; [audit-passed]',
      },
    });

    stateStore.recordDedupEvent(workItemId, 2, 'hash-rev-2');
    await workItemQueueManager.runInLane(workItemId, () =>
      processWorkItemAudit(workItemId, 2)
    );

    // Revision 3: Another update
    mockWitApi.getWorkItem.mockResolvedValueOnce({
      id: workItemId,
      rev: 3,
      fields: {
        'System.Title': 'Batch Processing Job',
        'System.Description': 'Processes daily transactions.',
        'Microsoft.VSTS.Common.AcceptanceCriteria':
          'Given batch of records, return 200 and process job. System actor verified.',
        'System.State': 'New',
        'System.Tags': 'batch; [awaiting-scope-lock]; [audit-passed]',
      },
    });

    stateStore.recordDedupEvent(workItemId, 3, 'hash-rev-3');
    await workItemQueueManager.runInLane(workItemId, () =>
      processWorkItemAudit(workItemId, 3)
    );

    // Total updateWorkItem calls across rev 1, 2, 3 must still be 1 (zero duplicate calls)
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);

    // StateStore must have exactly 1 audit log entry
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.auditLogs).toHaveLength(1);
  });
});

describe('PM Scope-Lock Gate - Scope Verdict Detection (Task 1)', () => {
  it('SCOPE-02 approve: detects approval when previousState is New and currentState is Ready to Dev', () => {
    const verdict = detectScopeVerdict({
      previousState: 'New',
      currentState: 'Ready to Dev',
      revisedBy: 'pm@example.com',
    });

    expect(verdict.type).toBe('approve');
    if (verdict.type === 'approve') {
      expect(verdict.actor).toBe('pm@example.com');
    }
  });

  it('SCOPE-02 approve: detects approval when tags include [scope-locked] and previousTags did not', () => {
    const verdict = detectScopeVerdict({
      previousState: 'New',
      currentState: 'New',
      previousTags: 'backend; [awaiting-scope-lock]',
      tags: 'backend; [awaiting-scope-lock]; [scope-locked]',
      revisedBy: 'lead@example.com',
    });

    expect(verdict.type).toBe('approve');
    if (verdict.type === 'approve') {
      expect(verdict.actor).toBe('lead@example.com');
    }
  });

  it('SCOPE-02 approve: detects approval when historyComment contains [approve-scope]', () => {
    const verdict = detectScopeVerdict({
      currentState: 'New',
      historyComment: 'Looks good to me! [approve-scope]',
      revisedBy: 'pm@example.com',
    });

    expect(verdict.type).toBe('approve');
    if (verdict.type === 'approve') {
      expect(verdict.comment).toContain('[approve-scope]');
      expect(verdict.actor).toBe('pm@example.com');
    }
  });

  it('SCOPE-02 reject: detects rejection when tags include [scope-rejected] or historyComment contains [reject-scope]', () => {
    const verdictFromTag = detectScopeVerdict({
      currentState: 'New',
      previousTags: 'backend; [awaiting-scope-lock]',
      tags: 'backend; [awaiting-scope-lock]; [scope-rejected]',
      revisedBy: 'pm@example.com',
    });

    expect(verdictFromTag.type).toBe('reject');
    if (verdictFromTag.type === 'reject') {
      expect(verdictFromTag.feedback).toBe(
        'Scope review rejected by PM without specific comments. Please clarify requirements and scope boundaries.'
      );
      expect(verdictFromTag.actor).toBe('pm@example.com');
    }

    const verdictFromComment = detectScopeVerdict({
      currentState: 'New',
      historyComment: '[reject-scope] Acceptance criteria missing error handling specs.',
      revisedBy: 'qa-lead@example.com',
    });

    expect(verdictFromComment.type).toBe('reject');
    if (verdictFromComment.type === 'reject') {
      expect(verdictFromComment.feedback).toBe('Acceptance criteria missing error handling specs.');
      expect(verdictFromComment.actor).toBe('qa-lead@example.com');
    }
  });

  it('SCOPE-02 feedback: strips [reject-scope] tokens and <!-- ... --> HTML comments, returning clean feedback text or default message', () => {
    const verdictWithComment = detectScopeVerdict({
      currentState: 'New',
      historyComment:
        '[reject-scope] Needs rate limiting test. <!-- [automated-agent] --> <!-- internal note -->',
      revisedBy: 'pm@example.com',
    });

    expect(verdictWithComment.type).toBe('reject');
    if (verdictWithComment.type === 'reject') {
      expect(verdictWithComment.feedback).toBe('Needs rate limiting test.');
    }

    const verdictBlank = detectScopeVerdict({
      currentState: 'New',
      historyComment: '[reject-scope] <!-- [automated-agent] -->',
    });

    expect(verdictBlank.type).toBe('reject');
    if (verdictBlank.type === 'reject') {
      expect(verdictBlank.feedback).toBe(
        'Scope review rejected by PM without specific comments. Please clarify requirements and scope boundaries.'
      );
    }
  });

  it('SCOPE-02 reset: detects reset when historyComment contains [reset-scope]', () => {
    const verdict = detectScopeVerdict({
      currentState: 'Blocked',
      historyComment: 'Requirements updated. [reset-scope] please re-evaluate.',
    });

    expect(verdict.type).toBe('reset_scope');
  });

  it('SCOPE-02 echo safety: detects approval from state/tag change even when historyComment contains automated agent markers', () => {
    const verdictStateChange = detectScopeVerdict({
      previousState: 'New',
      currentState: 'Ready to Dev',
      historyComment:
        '<p>[Scope Review Packet] L1 Audit Contract Passed</p>\n<!-- [automated-agent] -->',
      revisedBy: 'pm@example.com',
    });

    expect(verdictStateChange.type).toBe('approve');

    const verdictTagChange = detectScopeVerdict({
      currentState: 'New',
      previousTags: '[awaiting-scope-lock]',
      tags: '[awaiting-scope-lock]; [scope-locked]',
      historyComment: '<!-- [automated-agent] -->',
      revisedBy: 'pm@example.com',
    });

    expect(verdictTagChange.type).toBe('approve');
  });

  it('CR-02 safety: ignores [scope-locked] tag when previousTags is undefined or ticket is in In Dev', () => {
    // 1. previousTags undefined with [scope-locked] tag
    const verdictUndefinedPrev = detectScopeVerdict({
      currentState: 'In Dev',
      tags: 'backend; [scope-locked]',
      previousTags: undefined,
      revisedBy: 'dev@example.com',
    });
    expect(verdictUndefinedPrev.type).toBe('none');

    // 2. In Dev state even if tag was added in this rev, ticket is in flight and not awaiting scope
    const verdictInDev = detectScopeVerdict({
      currentState: 'In Dev',
      previousTags: 'backend',
      tags: 'backend; [scope-locked]',
      revisedBy: 'dev@example.com',
    });
    expect(verdictInDev.type).toBe('none');
  });
});

describe('PM Scope-Lock Gate - Breaker & Gate Transition (SCOPE-03 breaker)', () => {
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

  it('SCOPE-03 breaker isolation: evaluateScopeBreaker increments draft.scopeLock.iterationCount only; draft.reworkCycles remains null or unchanged', async () => {
    const workItemId = 3001;

    // Initialize ticket state with scopeLock and explicit null reworkCycles
    await workItemQueueManager.runInLane(workItemId, async () => {
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
        draft.reworkCycles = null;
      });
    });

    const res = await evaluateScopeBreaker(workItemId);
    expect(res.allowed).toBe(true);
    expect(res.iterationCount).toBe(1);

    const ticketAfter = await stateStore.getTicketState(workItemId);
    expect(ticketAfter?.scopeLock?.iterationCount).toBe(1);
    expect(ticketAfter?.scopeLock?.status).toBe('rejected');
    expect(ticketAfter?.reworkCycles).toBeNull();
  });

  it('SCOPE-03 breaker limit: Rejections 1 and 2 return allowed: true; rejection 3 returns allowed: false and sets status: blocked', async () => {
    const workItemId = 3002;

    const res1 = await evaluateScopeBreaker(workItemId);
    expect(res1.allowed).toBe(true);
    expect(res1.iterationCount).toBe(1);

    const t1 = await stateStore.getTicketState(workItemId);
    expect(t1?.scopeLock?.status).toBe('rejected');
    expect(t1?.scopeLock?.escalatedAt).toBeNull();

    const res2 = await evaluateScopeBreaker(workItemId);
    expect(res2.allowed).toBe(true);
    expect(res2.iterationCount).toBe(2);

    const t2 = await stateStore.getTicketState(workItemId);
    expect(t2?.scopeLock?.status).toBe('rejected');
    expect(t2?.scopeLock?.escalatedAt).toBeNull();

    const res3 = await evaluateScopeBreaker(workItemId);
    expect(res3.allowed).toBe(false);
    expect(res3.iterationCount).toBe(3);

    const t3 = await stateStore.getTicketState(workItemId);
    expect(t3?.scopeLock?.status).toBe('blocked');
    expect(t3?.scopeLock?.escalatedAt).toBeDefined();
    expect(t3?.reworkCycles).toBeUndefined();
  });

  it('SCOPE-03 breaker reset: resetScopeBreaker resets iterationCount to 0 and clears escalatedAt', async () => {
    const workItemId = 3003;

    // Trip the breaker with 3 rejections
    await evaluateScopeBreaker(workItemId);
    await evaluateScopeBreaker(workItemId);
    await evaluateScopeBreaker(workItemId);

    const blockedTicket = await stateStore.getTicketState(workItemId);
    expect(blockedTicket?.scopeLock?.iterationCount).toBe(3);
    expect(blockedTicket?.scopeLock?.status).toBe('blocked');
    expect(blockedTicket?.scopeLock?.escalatedAt).not.toBeNull();

    // Reset breaker
    await resetScopeBreaker(workItemId);

    const resetTicket = await stateStore.getTicketState(workItemId);
    expect(resetTicket?.scopeLock?.iterationCount).toBe(0);
    expect(resetTicket?.scopeLock?.escalatedAt).toBeNull();
    expect(resetTicket?.scopeLock?.remindedAt).toBeNull();
    expect(resetTicket?.scopeLock?.status).toBe('pending');
    expect(new Date(resetTicket?.scopeLock?.requestedAt!).getTime()).toBeGreaterThan(0);
  });

  it('SCOPE-03 breaker reset: handleScopeReset updates ADO to New with [awaiting-scope-lock] and clears [scope-unresolved]', async () => {
    const workItemId = 30031;
    const initialTags = 'backend; [scope-unresolved]';

    const mockWitApi = {
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    await handleScopeReset(workItemId, initialTags);

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp.value).toBe('New');

    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp.value).toContain('[awaiting-scope-lock]');
    expect(tagOp.value).not.toContain('[scope-unresolved]');
  });

  it('SCOPE-02 approval: handleScopeApproval sets scopeLock.status to locked, records lockedAt and lockedBy, removes [awaiting-scope-lock], adds [scope-locked], and sets state to Ready to Dev', async () => {
    const workItemId = 3004;
    const initialTags = 'frontend; [awaiting-scope-lock]; [audit-passed]';

    const mockWitApi = {
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    await handleScopeApproval(workItemId, initialTags, 'pm-approver@example.com');

    // 1. Verify StateStore
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.scopeLock?.status).toBe('locked');
    expect(ticket?.scopeLock?.lockedBy).toBe('pm-approver@example.com');
    expect(ticket?.scopeLock?.lockedAt).toBeDefined();

    // 2. Verify ADO call
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    const calledId = updateArgs[2];
    expect(calledId).toBe(workItemId);
    expect(patchDoc).toBeDefined();

    // State -> Ready to Dev
    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toBeDefined();
    expect(stateOp.op).toBe(Operation.Replace);
    expect(stateOp.value).toBe('Ready to Dev');

    // Tags updated: [scope-locked] added, [awaiting-scope-lock] removed
    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp.value).toContain('frontend');
    expect(tagOp.value).toContain('[audit-passed]');
    expect(tagOp.value).toContain('[scope-locked]');
    expect(tagOp.value).not.toContain('[awaiting-scope-lock]');

    // History contains confirmation and bot echo marker
    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Scope Locked]');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');
  });

  it('SCOPE-02 escalation: handleScopeRejection on 3rd bounce calls ADO with buildScopeEscalationPatch (State: Blocked, tag: [scope-unresolved])', async () => {
    const workItemId = 3005;
    const initialTags = 'payments; [awaiting-scope-lock]';

    const mockWitApi = {
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    // Pre-populate 2 rejections
    await evaluateScopeBreaker(workItemId);
    await evaluateScopeBreaker(workItemId);

    // 3rd rejection
    const result = await handleScopeRejection(
      workItemId,
      'Scope boundary is too broad. Please narrow to Stripe webhook only.',
      initialTags,
      'pm-reviewer@example.com'
    );

    expect(result.allowed).toBe(false);
    expect(result.iterationCount).toBe(3);

    // Verify ADO call with escalation patch
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    const calledId = updateArgs[2];
    expect(calledId).toBe(workItemId);
    expect(patchDoc).toBeDefined();

    // State -> Blocked
    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toBeDefined();
    expect(stateOp.op).toBe(Operation.Replace);
    expect(stateOp.value).toBe('Blocked');

    // Tags: [scope-unresolved] added, [awaiting-scope-lock] removed
    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp.value).toContain('payments');
    expect(tagOp.value).toContain('[scope-unresolved]');
    expect(tagOp.value).not.toContain('[awaiting-scope-lock]');

    // History contains escalation notice and bot echo marker
    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Scope Escalated]');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    // Verify StateStore state is blocked
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.scopeLock?.status).toBe('blocked');
    expect(ticket?.scopeLock?.iterationCount).toBe(3);
    expect(ticket?.reworkCycles).toBeUndefined();
  });

  it('SCOPE-03 breaker feedback: handleScopeRejection on 1st bounce posts feedback comment with loop shield and keeps status rejected', async () => {
    const workItemId = 3006;
    const initialTags = 'payments; [awaiting-scope-lock]';

    const mockWitApi = {
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const result = await handleScopeRejection(
      workItemId,
      'Please refine acceptance criteria for error responses.',
      initialTags,
      'pm-reviewer@example.com'
    );

    expect(result.allowed).toBe(true);
    expect(result.iterationCount).toBe(1);

    // Verify ADO call for feedback comment
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    const calledId = updateArgs[2];
    expect(calledId).toBe(workItemId);

    // History contains feedback comment and loop shield marker
    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Scope Rejected]');
    expect(historyOp.value).toContain('Please refine acceptance criteria for error responses.');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    // System.State must NOT be modified
    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toBeUndefined();

    // Verify StateStore state
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.scopeLock?.status).toBe('rejected');
    expect(ticket?.scopeLock?.iterationCount).toBe(1);
    expect(ticket?.scopeLock?.feedback).toBe(
      'Please refine acceptance criteria for error responses.'
    );
    expect(ticket?.reworkCycles).toBeUndefined();
  });
});

describe('PM Scope-Lock Gate - Scope Watchdog & ADO Reconciler (SCOPE-02 watchdog)', () => {
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

  it('exports TWENTY_FOUR_HOURS_MS and SEVENTY_TWO_HOURS_MS constants correctly', () => {
    expect(TWENTY_FOUR_HOURS_MS).toBe(24 * 60 * 60 * 1000);
    expect(SEVENTY_TWO_HOURS_MS).toBe(72 * 60 * 60 * 1000);
  });

  it('watchdog reminder: posts 24-hour reminder comment to ADO when pending >= 24h and sets remindedAt', async () => {
    const workItemId = 4001;
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);

    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.scopeLock = {
          status: 'pending',
          iterationCount: 0,
          requestedAt: twentyFiveHoursAgo.toISOString(),
          lockedAt: null,
          lockedBy: null,
          feedback: null,
          remindedAt: null,
          escalatedAt: null,
          createdAt: twentyFiveHoursAgo.toISOString(),
          updatedAt: twentyFiveHoursAgo.toISOString(),
        };
      });
    });

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        fields: {
          'System.State': 'New',
          'System.Tags': '[awaiting-scope-lock]; [audit-passed]',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const result = await checkScopeLockTimeouts();
    expect(result.reminded).toBe(1);
    expect(result.escalated).toBe(0);
    expect(result.reconciled).toBe(0);

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Scope Review Reminder]');
    expect(historyOp.value).toContain('Action Required');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.scopeLock?.remindedAt).toBeDefined();
    expect(ticket?.scopeLock?.remindedAt).not.toBeNull();
    expect(ticket?.scopeLock?.status).toBe('pending');
  });

  it('watchdog reminder idempotency: does not post second reminder if remindedAt is already set', async () => {
    const workItemId = 4002;
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const twentyNineHoursAgo = new Date(Date.now() - 29 * 60 * 60 * 1000);

    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.scopeLock = {
          status: 'pending',
          iterationCount: 0,
          requestedAt: thirtyHoursAgo.toISOString(),
          lockedAt: null,
          lockedBy: null,
          feedback: null,
          remindedAt: twentyNineHoursAgo.toISOString(),
          escalatedAt: null,
          createdAt: thirtyHoursAgo.toISOString(),
          updatedAt: twentyNineHoursAgo.toISOString(),
        };
      });
    });

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        fields: {
          'System.State': 'New',
          'System.Tags': '[awaiting-scope-lock]; [audit-passed]',
        },
      }),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const result = await checkScopeLockTimeouts();
    expect(result.reminded).toBe(0);
    expect(result.escalated).toBe(0);
    expect(result.reconciled).toBe(0);
    expect(mockWitApi.updateWorkItem).not.toHaveBeenCalled();
  });

  it('watchdog escalation: transitions ticket to Blocked with [scope-unresolved] tag when pending >= 72h and sets escalatedAt', async () => {
    const workItemId = 4003;
    const seventyFiveHoursAgo = new Date(Date.now() - 75 * 60 * 60 * 1000);

    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.scopeLock = {
          status: 'pending',
          iterationCount: 0,
          requestedAt: seventyFiveHoursAgo.toISOString(),
          lockedAt: null,
          lockedBy: null,
          feedback: null,
          remindedAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
          escalatedAt: null,
          createdAt: seventyFiveHoursAgo.toISOString(),
          updatedAt: seventyFiveHoursAgo.toISOString(),
        };
      });
    });

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        fields: {
          'System.State': 'New',
          'System.Tags': 'backend; [awaiting-scope-lock]; [audit-passed]',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const result = await checkScopeLockTimeouts();
    expect(result.escalated).toBe(1);
    expect(result.reminded).toBe(0);
    expect(result.reconciled).toBe(0);

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    });

    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp.value).toContain('[scope-unresolved]');
    expect(tagOp.value).not.toContain('[awaiting-scope-lock]');

    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Scope Review Escalation]');
    expect(historyOp.value).toContain('Work Item Blocked');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.scopeLock?.status).toBe('blocked');
    expect(ticket?.scopeLock?.escalatedAt).toBeDefined();
    expect(ticket?.scopeLock?.escalatedAt).not.toBeNull();
  });

  it('watchdog reconciliation: reconciles StateStore to locked when ADO state is Ready to Dev or has [scope-locked] without reminder/escalation', async () => {
    const workItemId = 4004;
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);

    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.scopeLock = {
          status: 'pending',
          iterationCount: 0,
          requestedAt: tenHoursAgo.toISOString(),
          lockedAt: null,
          lockedBy: null,
          feedback: null,
          remindedAt: null,
          escalatedAt: null,
          createdAt: tenHoursAgo.toISOString(),
          updatedAt: tenHoursAgo.toISOString(),
        };
      });
    });

    // Case: User moved card directly on ADO board to Ready to Dev
    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        fields: {
          'System.State': 'Ready to Dev',
          'System.Tags': 'backend; [awaiting-scope-lock]',
        },
      }),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const result = await checkScopeLockTimeouts();
    expect(result.reconciled).toBe(1);
    expect(result.reminded).toBe(0);
    expect(result.escalated).toBe(0);

    expect(mockWitApi.updateWorkItem).not.toHaveBeenCalled();

    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.scopeLock?.status).toBe('locked');
    expect(ticket?.scopeLock?.lockedAt).toBeDefined();
  });

  it('watchdog lifecycle: startScopeWatchdog returns object with stop method that clears interval', () => {
    vi.useFakeTimers();
    try {
      const watchdog = startScopeWatchdog(1000);
      expect(watchdog).toBeDefined();
      expect(typeof watchdog.stop).toBe('function');
      watchdog.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PM Scope-Lock Gate - Router Verdict Dispatch & Step 3 Guard (SCOPE-03 router)', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    adoClient.setWorkItemTrackingApi(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
  });

  it('router scope verdict: routes [approve-scope], [reject-scope], and [reset-scope] verdicts', async () => {
    const revisions: Record<number, Record<number, any>> = {};
    const mockWitApi = {
      getWorkItem: vi.fn().mockImplementation((id: number) => {
        const itemRevs = revisions[id] || {};
        const revKeys = Object.keys(itemRevs).map(Number);
        const maxRev = revKeys.length > 0 ? Math.max(...revKeys) : 1;
        return Promise.resolve(itemRevs[maxRev] || { id });
      }),
      getRevision: vi.fn().mockImplementation((id: number, rev: number) => {
        return Promise.resolve(revisions[id]?.[rev] || { id, rev });
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: 5001 }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    // 1. [approve-scope]
    const workItemIdApprove = 5001;
    revisions[workItemIdApprove] = {
      1: {
        id: workItemIdApprove,
        rev: 1,
        fields: {
          'System.State': 'New',
          'System.Tags': 'backend; [awaiting-scope-lock]',
        },
      },
      2: {
        id: workItemIdApprove,
        rev: 2,
        fields: {
          'System.Title': 'Approve Scope Ticket',
          'System.State': 'Ready to Dev',
          'System.Tags': 'backend; [awaiting-scope-lock]',
          'System.History': 'Approving scope [approve-scope]',
        },
      },
    };

    stateStore.recordDedupEvent(workItemIdApprove, 2, 'hash-5001');
    await routeWorkItemEvent(workItemIdApprove, 2);

    const ticketApprove = await stateStore.getTicketState(workItemIdApprove);
    expect(ticketApprove?.scopeLock?.status).toBe('locked');
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    expect(stateStore.getDedupEvent(workItemIdApprove, 2)?.status).toBe('completed');

    // 2. [reject-scope]
    const workItemIdReject = 5002;
    revisions[workItemIdReject] = {
      1: {
        id: workItemIdReject,
        rev: 1,
        fields: {
          'System.State': 'New',
          'System.Tags': 'backend; [awaiting-scope-lock]',
        },
      },
      2: {
        id: workItemIdReject,
        rev: 2,
        fields: {
          'System.Title': 'Reject Scope Ticket',
          'System.State': 'New',
          'System.Tags': 'backend; [awaiting-scope-lock]',
          'System.History': '[reject-scope] Acceptance criteria missing performance specs.',
        },
      },
    };

    stateStore.recordDedupEvent(workItemIdReject, 2, 'hash-5002');
    await routeWorkItemEvent(workItemIdReject, 2);

    const ticketReject = await stateStore.getTicketState(workItemIdReject);
    expect(ticketReject?.scopeLock?.status).toBe('rejected');
    expect(ticketReject?.scopeLock?.iterationCount).toBe(1);
    expect(ticketReject?.scopeLock?.feedback).toBe('Acceptance criteria missing performance specs.');
    expect(stateStore.getDedupEvent(workItemIdReject, 2)?.status).toBe('completed');

    // 3. [reset-scope]
    const workItemIdReset = 5003;
    // Pre-populate ticket with 3 rejections and blocked
    await workItemQueueManager.runInLane(workItemIdReset, async () => {
      await stateStore.updateTicketState(workItemIdReset, (draft) => {
        draft.scopeLock = {
          status: 'blocked',
          iterationCount: 3,
          requestedAt: new Date().toISOString(),
          lockedAt: null,
          lockedBy: null,
          feedback: 'Too many failures',
          remindedAt: null,
          escalatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });
    });

    revisions[workItemIdReset] = {
      1: {
        id: workItemIdReset,
        rev: 1,
        fields: {
          'System.State': 'Blocked',
          'System.Tags': 'backend; [scope-unresolved]',
        },
      },
      2: {
        id: workItemIdReset,
        rev: 2,
        fields: {
          'System.Title': 'Reset Scope Ticket',
          'System.State': 'Blocked',
          'System.Tags': 'backend; [scope-unresolved]',
          'System.History': 'PM updated criteria [reset-scope] please re-evaluate',
        },
      },
    };

    stateStore.recordDedupEvent(workItemIdReset, 2, 'hash-5003');
    await routeWorkItemEvent(workItemIdReset, 2);

    const ticketReset = await stateStore.getTicketState(workItemIdReset);
    expect(ticketReset?.scopeLock?.iterationCount).toBe(0);
    expect(ticketReset?.scopeLock?.escalatedAt).toBeNull();
    expect(stateStore.getDedupEvent(workItemIdReset, 2)?.status).toBe('completed');

    // Verify ADO call unblocked ticket to New and restored [awaiting-scope-lock]
    const resetCall = mockWitApi.updateWorkItem.mock.calls[2];
    const resetPatch = resetCall.find((a: any) => Array.isArray(a));
    const resetStateOp = resetPatch.find((op: any) => op.path === '/fields/System.State');
    expect(resetStateOp.value).toBe('New');
    const resetTagOp = resetPatch.find((op: any) => op.path === '/fields/System.Tags');
    expect(resetTagOp.value).toContain('[awaiting-scope-lock]');
    expect(resetTagOp.value).not.toContain('[scope-unresolved]');
  });

  it('router Step 3 guard: refuses In Dev dispatch when ticket is not scope-locked and marks dedup skipped', async () => {
    const workItemId = 5004;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Unlocked In Dev Ticket',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      getRevision: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Unlocked In Dev Ticket',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-5004');
    await routeWorkItemEvent(workItemId, revId);

    expect(processWorkItemExecute).not.toHaveBeenCalled();
    const dedup = stateStore.getDedupEvent(workItemId, revId);
    expect(dedup?.status).toBe('skipped');
    expect(dedup?.errorMessage).toContain('In Dev dispatch refused: ticket is not scope-locked');
  });

  it('router Step 3 pass: dispatches to processWorkItemExecute when ticket scope is locked', async () => {
    const workItemId = 5005;
    const revId = 2;

    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        const now = new Date().toISOString();
        draft.scopeLock = {
          status: 'locked',
          iterationCount: 1,
          requestedAt: now,
          lockedAt: now,
          lockedBy: 'pm@example.com',
          feedback: null,
          remindedAt: null,
          escalatedAt: null,
          createdAt: now,
          updatedAt: now,
        };
      });
    });

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Locked In Dev Ticket',
          'System.State': 'In Dev',
          'System.Tags': 'backend; [scope-locked]',
        },
      }),
      getRevision: vi.fn().mockImplementation((id: number, rev: number) => {
        if (rev === 1) {
          return Promise.resolve({
            id: workItemId,
            rev: 1,
            fields: {
              'System.State': 'Ready to Dev',
              'System.Tags': 'backend; [scope-locked]',
            },
          });
        }
        return Promise.resolve({
          id: workItemId,
          rev: 2,
          fields: {
            'System.Title': 'Locked In Dev Ticket',
            'System.State': 'In Dev',
            'System.Tags': 'backend; [scope-locked]',
          },
        });
      }),
      updateWorkItem: vi.fn(),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-5005');
    const executeOptions = { maxDiffLoc: 150 };
    await routeWorkItemEvent(workItemId, revId, executeOptions);

    expect(processWorkItemExecute).toHaveBeenCalledWith(workItemId, revId, executeOptions);
  });
});


