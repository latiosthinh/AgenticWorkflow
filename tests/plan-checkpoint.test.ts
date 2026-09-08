import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { eq, and } from 'drizzle-orm';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { db, sqlite } from '../src/db/index.js';
import { planCheckpoints, dedupEvents, auditLogs } from '../src/db/schema.js';
import { adoClient } from '../src/ado/client.js';
import {
  createPlanCheckpoint,
  getPendingCheckpoint,
  lockPlanCheckpoint,
  updateCheckpointStatus,
} from '../src/plan/checkpoint.js';
import { cleanupWorktree } from '../src/sandbox/worktree.js';
import { checkPlanCheckpointTimeouts } from '../src/plan/watchdog.js';
import { processWorkItemExecute } from '../src/execute/worker.js';
import { routeWorkItemEvent } from '../src/execute/router.js';

afterEach(async () => {
  const worktreeDir = path.join(process.cwd(), '.worktrees');
  if (fs.existsSync(worktreeDir)) {
    const entries = fs.readdirSync(worktreeDir);
    for (const entry of entries) {
      if (entry.startsWith('ticket-')) {
        const fullPath = path.join(worktreeDir, entry);
        await cleanupWorktree(process.cwd(), fullPath, { deleteBranch: true }).catch(() => {});
      }
    }
  }
});

describe('Plan Checkpoint Persistence & Lifecycle', () => {
  beforeEach(() => {
    sqlite.exec(
      'DELETE FROM dedup_events; DELETE FROM audit_log; DELETE FROM plan_checkpoints;'
    );
    adoClient.setWorkItemTrackingApi(null);
  });

  it('performs CRUD operations on planCheckpoints table in SQLite', async () => {
    const cp = await createPlanCheckpoint({
      workItemId: 3001,
      revId: 1,
      questions: ['Which DB schema?', 'What status code?'],
      planMarkdown: 'Step 1: migrate\nStep 2: build',
      estimatedFiles: ['src/db.ts'],
      testStrategy: 'vitest',
    });

    expect(cp.id).toBeDefined();
    expect(cp.status).toBe('pending_human_input');
    expect(JSON.parse(cp.questions)).toEqual(['Which DB schema?', 'What status code?']);

    // Retrieve pending checkpoint
    const pending = await getPendingCheckpoint(3001);
    expect(pending).toBeDefined();
    expect(pending?.id).toBe(cp.id);

    // Lock plan checkpoint
    await lockPlanCheckpoint(cp.id, 'Use schema v2 and return 400', 'Updated plan markdown');

    const updatedPending = await getPendingCheckpoint(3001);
    expect(updatedPending).toBeUndefined();

    const [row] = db
      .select()
      .from(planCheckpoints)
      .where(eq(planCheckpoints.id, cp.id))
      .all();
    expect(row.status).toBe('locked');
    expect(row.answers).toBe('Use schema v2 and return 400');
    expect(row.planMarkdown).toBe('Updated plan markdown');

    // Update status to expired
    await updateCheckpointStatus(cp.id, 'expired');
    const [expiredRow] = db
      .select()
      .from(planCheckpoints)
      .where(eq(planCheckpoints.id, cp.id))
      .all();
    expect(expiredRow.status).toBe('expired');
  });
});

describe('Plan Watchdog 24h/72h Timeouts', () => {
  beforeEach(() => {
    sqlite.exec(
      'DELETE FROM dedup_events; DELETE FROM audit_log; DELETE FROM plan_checkpoints;'
    );
    adoClient.setWorkItemTrackingApi(null);
  });

  it('posts 24h reminder ping comment when questions remain unanswered', async () => {
    const workItemId = 4001;
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);

    db.insert(planCheckpoints)
      .values({
        workItemId,
        revId: 1,
        status: 'pending_human_input',
        questions: JSON.stringify(['Clarification question 1']),
        createdAt: twentyFiveHoursAgo,
        updatedAt: twentyFiveHoursAgo,
      })
      .run();

    const mockWitApi = {
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const result = await checkPlanCheckpointTimeouts();
    expect(result.reminded).toBe(1);
    expect(result.escalated).toBe(0);

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    expect(updateArgs).toContain(workItemId);
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Plan Reminder]');
    expect(historyOp.value).toContain('Action Required: Unanswered Questions');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    const [cp] = db
      .select()
      .from(planCheckpoints)
      .where(eq(planCheckpoints.workItemId, workItemId))
      .all();
    expect(cp.remindedAt).not.toBeNull();
  });

  it('posts 72h escalation comment and transitions work item to Blocked', async () => {
    const workItemId = 4002;
    const seventyFiveHoursAgo = new Date(Date.now() - 75 * 60 * 60 * 1000);

    db.insert(planCheckpoints)
      .values({
        workItemId,
        revId: 1,
        status: 'pending_human_input',
        questions: JSON.stringify(['Critical missing architecture question']),
        createdAt: seventyFiveHoursAgo,
        updatedAt: seventyFiveHoursAgo,
      })
      .run();

    const mockWitApi = {
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const result = await checkPlanCheckpointTimeouts();
    expect(result.escalated).toBe(1);
    expect(result.reminded).toBe(0);

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    expect(updateArgs).toContain(workItemId);
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    });

    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Plan Checkpoint] Escalation: Work Item Blocked');

    const [cp] = db
      .select()
      .from(planCheckpoints)
      .where(eq(planCheckpoints.workItemId, workItemId))
      .all();
    expect(cp.status).toBe('blocked');
    expect(cp.escalatedAt).not.toBeNull();
  });

  it('handles API error in one checkpoint without starving subsequent checkpoints', async () => {
    const errorWorkItemId = 4003;
    const okWorkItemId = 4004;
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);

    db.insert(planCheckpoints)
      .values({
        workItemId: errorWorkItemId,
        revId: 1,
        status: 'pending_human_input',
        questions: JSON.stringify(['Question 1']),
        createdAt: oldTime,
        updatedAt: oldTime,
      })
      .run();

    db.insert(planCheckpoints)
      .values({
        workItemId: okWorkItemId,
        revId: 1,
        status: 'pending_human_input',
        questions: JSON.stringify(['Question 2']),
        createdAt: oldTime,
        updatedAt: oldTime,
      })
      .run();

    const mockWitApi = {
      updateWorkItem: vi.fn().mockImplementation((...args: any[]) => {
        const id = args.find((a: any) => typeof a === 'number');
        if (id === errorWorkItemId) {
          return Promise.reject(new Error('ADO ticket deleted or permission denied'));
        }
        return Promise.resolve({ id });
      }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    const result = await checkPlanCheckpointTimeouts();
    expect(result.reminded).toBe(1);

    const [okCp] = db
      .select()
      .from(planCheckpoints)
      .where(eq(planCheckpoints.workItemId, okWorkItemId))
      .all();
    expect(okCp.remindedAt).not.toBeNull();
  });
});

describe('Execution Worker Pipeline', () => {
  beforeEach(() => {
    sqlite.exec(
      'DELETE FROM dedup_events; DELETE FROM audit_log; DELETE FROM plan_checkpoints;'
    );
    adoClient.setWorkItemTrackingApi(null);
  });

  it('ambiguity flow: creates worktree, posts [Plan Q&A], tags [awaiting-input], and releases worktree', async () => {
    const workItemId = 5001;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': '[ambiguous] Setup cloud storage',
          'System.Description': 'Store files somewhere',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Files should be retrievable',
          'System.State': 'In Dev',
          'System.Tags': 'backend; infra',
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
        payloadHash: 'hash-5001',
        receivedAt: new Date(),
      })
      .run();

    await processWorkItemExecute(workItemId, revId);

    // Verify ADO was patched with [awaiting-input] tag and [Plan Q&A] comment
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const patchDoc = mockWitApi.updateWorkItem.mock.calls[0].find((a: any) =>
      Array.isArray(a)
    );
    expect(patchDoc).toBeDefined();

    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp.value).toContain('[awaiting-input]');
    expect(tagOp.value).toContain('backend');

    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toMatch(/\[Plan Q(&amp;|&)A\]/);
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    // Verify checkpoint persisted with pending_human_input
    const cp = await getPendingCheckpoint(workItemId);
    expect(cp).toBeDefined();
    expect(cp?.status).toBe('pending_human_input');

    // Verify worktree directory does not exist on disk (immediately released)
    const worktreeDir = path.join(process.cwd(), '.worktrees');
    const entries = fs.existsSync(worktreeDir) ? fs.readdirSync(worktreeDir) : [];
    const ticketWorktree = entries.find((name) =>
      name.startsWith(`ticket-${workItemId}`)
    );
    expect(ticketWorktree).toBeUndefined();

    // Verify dedupEvents status is completed
    const dedup = db
      .select()
      .from(dedupEvents)
      .where(and(eq(dedupEvents.workItemId, workItemId), eq(dedupEvents.revId, revId)))
      .get();
    expect(dedup?.status).toBe('completed');
  });

  it('resumption flow: locks plan, removes [awaiting-input] tag, and posts [Plan Checkpoint] comment', async () => {
    const workItemId = 5002;
    const revId = 2;

    // Create existing pending checkpoint
    const initialCp = await createPlanCheckpoint({
      workItemId,
      revId: 1,
      questions: ['Which database schema should be modified?'],
      planMarkdown: '### Implementation Plan\n1. Modify src/db.ts\n2. Add migration',
      estimatedFiles: ['src/db.ts'],
      testStrategy: 'vitest run tests/db.test.ts',
    });

    const mockWorkItemData = {
      id: workItemId,
      rev: revId,
      fields: {
        'System.Title': 'Setup cloud storage',
        'System.Description': 'Store files in S3 bucket',
        'Microsoft.VSTS.Common.AcceptanceCriteria': 'Given file, upload to S3',
        'System.State': 'In Dev',
        'System.Tags': 'backend; [awaiting-input]',
        'System.History':
          '<p>Use Postgres schema and return 400 on validation failure</p>',
      },
    };

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue(mockWorkItemData),
      getRevision: vi.fn().mockResolvedValue(mockWorkItemData),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    db.insert(dedupEvents)
      .values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash: 'hash-5002',
        receivedAt: new Date(),
      })
      .run();

    await processWorkItemExecute(workItemId, revId);

    // Verify ADO was updated
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const patchDoc = mockWitApi.updateWorkItem.mock.calls[0].find((a: any) =>
      Array.isArray(a)
    );
    expect(patchDoc).toBeDefined();

    // Verify [awaiting-input] tag removed
    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp.value).not.toContain('[awaiting-input]');
    expect(tagOp.value).toContain('backend');

    // Verify [Plan Checkpoint] locked comment posted
    const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.value).toContain('[Plan Checkpoint]');
    expect(historyOp.value).toContain('Implementation Plan Locked');
    expect(historyOp.value).toContain('<!-- [automated-agent] -->');

    // Verify checkpoint is now locked with answers
    const pendingCp = await getPendingCheckpoint(workItemId);
    expect(pendingCp).toBeUndefined();

    const [lockedCp] = db
      .select()
      .from(planCheckpoints)
      .where(eq(planCheckpoints.id, initialCp.id))
      .all();
    expect(lockedCp.status).toBe('locked');
    expect(lockedCp.answers).toContain(
      '<p>Use Postgres schema and return 400 on validation failure</p>'
    );

    // Verify dedupEvents status is completed
    const dedup = db
      .select()
      .from(dedupEvents)
      .where(and(eq(dedupEvents.workItemId, workItemId), eq(dedupEvents.revId, revId)))
      .get();
    expect(dedup?.status).toBe('completed');
  });

  it('resumption flow: accepts human reply that quotes [Plan Q&A] substring', async () => {
    const workItemId = 5003;
    const revId = 2;

    const initialCp = await createPlanCheckpoint({
      workItemId,
      revId: 1,
      questions: ['Which database schema should be modified?'],
      planMarkdown: '### Implementation Plan\n1. Modify src/db.ts',
      estimatedFiles: ['src/db.ts'],
      testStrategy: 'vitest run tests/db.test.ts',
    });

    const mockWorkItemData = {
      id: workItemId,
      rev: revId,
      fields: {
        'System.Title': 'Setup cloud storage',
        'System.Description': 'Store files in S3 bucket',
        'Microsoft.VSTS.Common.AcceptanceCriteria': 'Given file, upload to S3',
        'System.State': 'In Dev',
        'System.Tags': 'backend; [awaiting-input]',
        'System.History':
          '<p>Regarding [Plan Q&A]: we will use Postgres and Redis.</p>',
      },
    };

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue(mockWorkItemData),
      getRevision: vi.fn().mockResolvedValue(mockWorkItemData),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    db.insert(dedupEvents)
      .values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash: 'hash-5003',
        receivedAt: new Date(),
      })
      .run();

    await processWorkItemExecute(workItemId, revId);

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const [lockedCp] = db
      .select()
      .from(planCheckpoints)
      .where(eq(planCheckpoints.id, initialCp.id))
      .all();
    expect(lockedCp.status).toBe('locked');
    expect(lockedCp.answers).toContain('Regarding [Plan Q&A]: we will use Postgres and Redis.');
  });
});

describe('Execute Router Dispatches', () => {
  beforeEach(() => {
    sqlite.exec(
      'DELETE FROM dedup_events; DELETE FROM audit_log; DELETE FROM plan_checkpoints;'
    );
    adoClient.setWorkItemTrackingApi(null);
  });

  it('routes New tickets to auditor worker', async () => {
    const workItemId = 6001;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Create user authentication endpoint',
          'System.Description': 'System authenticates client user with credentials.',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given credentials, return 200 and JWT. Test assert conditions met.',
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
        payloadHash: 'hash-6001',
        receivedAt: new Date(),
      })
      .run();

    await routeWorkItemEvent(workItemId, revId);

    // Auditor logs outcome
    const log = db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workItemId, workItemId))
      .get();
    expect(log).toBeDefined();
    expect(log?.verdict).toBe('passed');
  });

  it('routes In Dev tickets to execute worker', async () => {
    const workItemId = 6002;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Implement clean feature',
          'System.Description': 'Concrete feature implementation',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            'Given input, output matches spec. Assert tests pass.',
          'System.State': 'In Dev',
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
        payloadHash: 'hash-6002',
        receivedAt: new Date(),
      })
      .run();

    await routeWorkItemEvent(workItemId, revId);

    // Checkpoint created for execute worker
    const [cp] = db
      .select()
      .from(planCheckpoints)
      .where(eq(planCheckpoints.workItemId, workItemId))
      .all();
    expect(cp).toBeDefined();
    expect(cp.status).toBe('locked');
  });

  it('skips tickets with unsupported state', async () => {
    const workItemId = 6003;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Closed ticket',
          'System.Description': 'Already done',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Done',
          'System.State': 'Closed',
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
        payloadHash: 'hash-6003',
        receivedAt: new Date(),
      })
      .run();

    await routeWorkItemEvent(workItemId, revId);

    const dedup = db
      .select()
      .from(dedupEvents)
      .where(and(eq(dedupEvents.workItemId, workItemId), eq(dedupEvents.revId, revId)))
      .get();
    expect(dedup?.status).toBe('skipped');
    expect(dedup?.errorMessage).toContain("Ticket state 'Closed' has no active handler");
  });
});
