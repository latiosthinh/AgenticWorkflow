import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processWorkItemAudit } from '../src/auditor/worker.js';
import { adoClient } from '../src/ado/client.js';
import { db, sqlite } from '../src/db/index.js';
import { dedupEvents, auditLogs } from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { buildApp } from '../src/index.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import crypto from 'node:crypto';
import { env } from '../src/config/env.js';

describe('Background Audit Worker Pipeline', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM dedup_events; DELETE FROM audit_log;');
    adoClient.setWorkItemTrackingApi(null);
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

    db.insert(dedupEvents)
      .values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash: 'hash-1001',
        receivedAt: new Date(),
      })
      .run();

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

    // Verify SQLite auditLogs has verdict 'passed'
    const log = db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.workItemId, workItemId), eq(auditLogs.revId, revId)))
      .get();
    expect(log).toBeDefined();
    expect(log?.verdict).toBe('passed');
    expect(log?.model).toBe('gpt-4o');
    expect(log?.criteriaSummary).toBeTruthy();

    // Verify dedupEvents status is 'completed'
    const dedup = db
      .select()
      .from(dedupEvents)
      .where(and(eq(dedupEvents.workItemId, workItemId), eq(dedupEvents.revId, revId)))
      .get();
    expect(dedup?.status).toBe('completed');
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

    db.insert(dedupEvents)
      .values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash: 'hash-1002',
        receivedAt: new Date(),
      })
      .run();

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

    // Verify SQLite auditLogs has verdict 'failed'
    const log = db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.workItemId, workItemId), eq(auditLogs.revId, revId)))
      .get();
    expect(log).toBeDefined();
    expect(log?.verdict).toBe('failed');

    // Verify dedupEvents status is 'completed'
    const dedup = db
      .select()
      .from(dedupEvents)
      .where(and(eq(dedupEvents.workItemId, workItemId), eq(dedupEvents.revId, revId)))
      .get();
    expect(dedup?.status).toBe('completed');
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

    db.insert(dedupEvents)
      .values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash: 'hash-1003',
        receivedAt: new Date(),
      })
      .run();

    await processWorkItemAudit(workItemId, revId);

    // Verify no ADO mutations occurred
    expect(mockWitApi.updateWorkItem).not.toHaveBeenCalled();

    // Verify no audit log record was inserted
    const logs = db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workItemId, workItemId))
      .all();
    expect(logs).toHaveLength(0);

    // Verify dedupEvents status is 'skipped'
    const dedup = db
      .select()
      .from(dedupEvents)
      .where(and(eq(dedupEvents.workItemId, workItemId), eq(dedupEvents.revId, revId)))
      .get();
    expect(dedup?.status).toBe('skipped');
    expect(dedup?.errorMessage).toContain("Ticket state is 'In Dev', expected 'New'");
  });

  it('marks dedupEvents as failed when unhandled exception occurs', async () => {
    const workItemId = 1004;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockRejectedValue(new Error('Network connection timeout')),
      updateWorkItem: vi.fn(),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    db.insert(dedupEvents)
      .values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash: 'hash-1004',
        receivedAt: new Date(),
      })
      .run();

    await expect(processWorkItemAudit(workItemId, revId)).rejects.toThrow('Network connection timeout');

    const dedup = db
      .select()
      .from(dedupEvents)
      .where(and(eq(dedupEvents.workItemId, workItemId), eq(dedupEvents.revId, revId)))
      .get();
    expect(dedup?.status).toBe('failed');
    expect(dedup?.errorMessage).toContain('Network connection timeout');
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
    const log = db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.workItemId, workItemId), eq(auditLogs.revId, revId)))
      .get();
    expect(log).toBeDefined();
    expect(log?.verdict).toBe('passed');

    const dedup = db
      .select()
      .from(dedupEvents)
      .where(and(eq(dedupEvents.workItemId, workItemId), eq(dedupEvents.revId, revId)))
      .get();
    expect(dedup?.status).toBe('completed');

    await app.close();
  });
});
