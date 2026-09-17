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
import { processWorkItemAudit } from '../src/auditor/worker.js';
import { adoClient } from '../src/ado/client.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';

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
