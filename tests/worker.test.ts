import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { processWorkItemAudit } from '../src/auditor/worker.js';
import { adoClient } from '../src/ado/client.js';
import { buildApp } from '../src/index.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';

describe('Background Audit Worker Pipeline', () => {
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

  it('Case 1: transitions passing ticket to Ready to Dev, logs audit, and completes dedup', async () => {
    const workItemId = 1001;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'User Authentication Endpoint',
          'System.Description': 'System allows registered user to log in and receive token.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given valid credentials, return 200 and JWT response. System actor verified.',
          'System.State': 'New',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-1001');

    await processWorkItemAudit(workItemId, revId);

    // Verify ADO update was invoked with Ready to Dev transition
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Ready to Dev',
    });

    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('<strong>[L1 Evidence] Contract Audit: PASSED</strong>');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    // Verify StateStore ticket state has auditLogs entry
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket).toBeDefined();
    expect(ticket?.auditLogs).toHaveLength(1);
    expect(ticket?.auditLogs[0].verdict).toBe('passed');
    expect(ticket?.auditLogs[0].model).toBe('gpt-4o');
    expect(ticket?.auditLogs[0].criteriaSummary).toBeTruthy();

    // Verify dedup marker status is 'completed'
    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(dedup.status).toBe('completed');
  });

  it('Case 2: retains failing ticket in New, posts feedback comment, and logs audit', async () => {
    const workItemId = 1002;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Fix bug',
          'System.Description': 'TODO later',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'TBD',
          'System.State': 'New',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-1002');

    await processWorkItemAudit(workItemId, revId);

    // Verify updateWorkItem was called with only history add, NOT state change
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toBeUndefined();

    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('<strong>[L1 Evidence] Contract Audit: INCOMPLETE (Action Required)</strong>');
    expect(historyOp.value).toContain('Retained in New');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    // Verify StateStore ticket state has auditLogs entry with verdict 'failed'
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket).toBeDefined();
    expect(ticket?.auditLogs).toHaveLength(1);
    expect(ticket?.auditLogs[0].verdict).toBe('failed');

    // Verify dedup marker status is 'completed'
    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(dedup.status).toBe('completed');
  });

  it('Case 3: skips audit without patching when ticket is already in In Dev', async () => {
    const workItemId = 1003;
    const revId = 2;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'In development ticket',
          'System.Description': 'Coding in progress',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Unit tests pass',
          'System.State': 'In Dev',
        },
      }),
      updateWorkItem: vi.fn(),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-1003');

    await processWorkItemAudit(workItemId, revId);

    // Verify no ADO mutations occurred
    expect(mockWitApi.updateWorkItem).not.toHaveBeenCalled();

    // Verify no ticket state was created for skipped item
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket).toBeNull();

    // Verify dedup marker status is 'skipped'
    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(dedup.status).toBe('skipped');
    expect(dedup.errorMessage).toContain("Ticket state is 'In Dev', expected 'New'");
  });

  it('marks dedupEvents as failed when unhandled exception occurs', async () => {
    const workItemId = 1004;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockRejectedValue(new Error('Network connection timeout')),
      updateWorkItem: vi.fn(),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-1004');

    await expect(processWorkItemAudit(workItemId, revId)).rejects.toThrow('Network connection timeout');

    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(dedup.status).toBe('failed');
    expect(dedup.errorMessage).toContain('Network connection timeout');
  });

  it('processes webhook event through Fastify routes and lane queue end-to-end', async () => {
    const workItemId = 2001;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Implement Payment Invoicing',
          'System.Description': 'System issues invoice to client actor upon order verification.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given order details, calculate total and return 201 with invoice id. Assert test conditions.',
          'System.State': 'New',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const app = await buildApp();

    const payload = JSON.stringify({
      eventType: 'workitem.created',
      resource: {
        id: workItemId,
        rev: revId,
        revisedBy: { id: 'developer-user-uuid' },
      },
    });

    const signature = `sha256=${crypto
      .createHmac('sha256', env.ADO_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex')}`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/ado/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature,
      },
      payload,
    });

    expect(res.statusCode).toBe(202);

    // Wait for the background queue lane to finish
    await workItemQueueManager.getLane(workItemId).onIdle();

    // Verify background worker processed the audit
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket).toBeDefined();
    expect(ticket?.auditLogs).toHaveLength(1);
    expect(ticket?.auditLogs[0].verdict).toBe('passed');

    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(dedup.status).toBe('completed');

    await app.close();
  });
});
