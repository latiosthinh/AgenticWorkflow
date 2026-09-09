import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { eq, and } from 'drizzle-orm';
import { db, sqlite } from '../src/db/index.js';
import { dedupEvents, reworkCycles, l3Evidence } from '../src/db/schema.js';
import { adoClient } from '../src/ado/client.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { processWorkItemRework } from '../src/execute/rework-worker.js';
import {
  transitionToDevDoneWithPacket,
  escalateReworkToBlocked,
} from '../src/ado/work-item.js';
import { cleanupWorktree } from '../src/sandbox/worktree.js';
import { evaluateCircuitBreaker, resetCircuitBreaker } from '../src/accept/breaker.js';

describe('Rework Execution Integration & Router Workflow', () => {
  const rootGit = simpleGit(process.cwd());

  beforeEach(() => {
    sqlite.exec(
      'DELETE FROM dedup_events; DELETE FROM rework_cycles; DELETE FROM l3_evidence; DELETE FROM audit_log; DELETE FROM plan_checkpoints;'
    );
    adoClient.setWorkItemTrackingApi(null);
  });

  afterEach(async () => {
    const worktreeDir = path.join(process.cwd(), '.worktrees');
    if (fs.existsSync(worktreeDir)) {
      const entries = fs.readdirSync(worktreeDir);
      for (const entry of entries) {
        if (entry.startsWith('ticket-')) {
          const fullPath = path.join(worktreeDir, entry);
          await cleanupWorktree(process.cwd(), fullPath, { deleteBranch: true }).catch(
            () => {}
          );
        }
      }
    }
    const branches = await rootGit.branchLocal();
    for (const b of branches.all) {
      if (b.startsWith('task/ticket-')) {
        await rootGit.raw(['branch', '-D', b]).catch(() => {});
      }
    }
  });

  it('Unit: transitionToDevDoneWithPacket and escalateReworkToBlocked call ADO with expected patch structure', async () => {
    const workItemId = 6001;
    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: 1,
        fields: {
          'System.Title': 'Test Ticket',
          'System.State': 'In Dev',
          'System.Tags': 'backend; [awaiting-input]',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    await transitionToDevDoneWithPacket(workItemId, '<div>Test Packet</div>');
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const patch1 = mockWitApi.updateWorkItem.mock.calls[0][1];
    const stateOp1 = patch1.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp1.value).toBe('Dev Done');
    const tagOp1 = patch1.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp1.value).toContain('[awaiting-acceptance]');
    expect(tagOp1.value).not.toContain('[awaiting-input]');

    await escalateReworkToBlocked(workItemId, 3);
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(2);
    const patch2 = mockWitApi.updateWorkItem.mock.calls[1][1];
    const stateOp2 = patch2.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp2.value).toBe('Blocked');
    const tagOp2 = patch2.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp2.value).toContain('[rework-escalated]');
    expect(tagOp2.value).not.toContain('[awaiting-acceptance]');
  });

  it('Test 1: Human approve verdict updates work item tags ([acceptance-approved]) and removes [awaiting-acceptance]', async () => {
    const workItemId = 6002;
    const revId = 2;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Payment Gateway Integration',
          'System.State': 'Ready for QA',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'System.History': 'Verified on preview. [approve-acceptance]',
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

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const patch = mockWitApi.updateWorkItem.mock.calls[0][1];
    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp.value).toContain('[acceptance-approved]');
    expect(tagOp.value).not.toContain('[awaiting-acceptance]');

    const dedup = db.select().from(dedupEvents).where(eq(dedupEvents.workItemId, workItemId)).get();
    expect(dedup?.status).toBe('completed');
  });

  it('Test 2: Rejection triggers processWorkItemRework, resumes existing task branch, commits fix(review), and transitions to Dev Done', async () => {
    const workItemId = 6003;
    const revId = 2;
    const branchName = `task/ticket-${workItemId}-rework-flow-feature`;

    // Create preexisting task branch with an initial commit
    try {
      await rootGit.raw(['branch', branchName, 'HEAD']);
    } catch {
      // Ignore if branch exists
    }

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Rework Flow Feature',
          'System.Description': 'Initial implementation had missing validation.',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Validate positive amount.',
          'System.State': 'In Dev',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'System.History': 'Input <= 0 must return 400. [reject-acceptance]',
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
        payloadHash: 'hash-6003',
        receivedAt: new Date(),
      })
      .run();

    let promptReceived = '';
    await routeWorkItemEvent(workItemId, revId, {
      mockCodeEdit: async (worktreePath: string, prompt?: string) => {
        promptReceived = prompt || '';
        fs.writeFileSync(
          path.join(worktreePath, 'rework_fix.ts'),
          'export function validateAmount(n: number) { return n > 0; }\n'
        );
      },
      mockTestRunner: async () => ({
        passed: true,
        exitCode: 0,
        stdout: 'Tests  2 passed (2)\nDuration 150ms',
        stderr: '',
        timedOut: false,
        durationMs: 150,
      }),
    });

    // 1. Verify prompt envelope received feedback
    expect(promptReceived).toContain('<reviewer_feedback>');
    expect(promptReceived).toContain('Input &lt;= 0 must return 400.');

    // 2. Verify circuit breaker recorded bounce 1
    const breakerRow = db.select().from(reworkCycles).where(eq(reworkCycles.workItemId, workItemId)).get();
    expect(breakerRow?.bounceCount).toBe(1);

    // 3. Verify L3 evidence recorded
    const evidenceRows = db.select().from(l3Evidence).where(eq(l3Evidence.workItemId, workItemId)).all();
    expect(evidenceRows.length).toBeGreaterThanOrEqual(1);
    expect(evidenceRows[0].passed).toBe(2);

    // 4. Verify branch committed with fix(review) message
    const branchLog = await rootGit.raw(['log', branchName, '-n', '1', '--oneline']);
    expect(branchLog).toContain(`fix(review): address acceptance feedback`);

    // 5. Verify ADO transitioned back to Dev Done with acceptance packet
    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const lastPatch = updateCalls[updateCalls.length - 1][1];
    const stateOp = lastPatch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Dev Done');
    const tagOp = lastPatch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[awaiting-acceptance]');
    const historyOp = lastPatch.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toContain('[Acceptance Packet]');
    expect(historyOp?.value).toContain('<!-- [automated-agent] -->');
  });

  it('Test 3: 3rd rejection trips circuit breaker, transitions ticket to Blocked, tags [rework-escalated], and skips rework execution', async () => {
    const workItemId = 6004;
    const revId = 4;

    // Simulate 2 previous bounces
    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'accept');

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Complex Bugfix',
          'System.State': 'In Dev',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'System.History': 'Still not working properly. [reject-acceptance]',
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
        payloadHash: 'hash-6004',
        receivedAt: new Date(),
      })
      .run();

    await routeWorkItemEvent(workItemId, revId);

    // Verify circuit breaker tripped
    const breakerRow = db.select().from(reworkCycles).where(eq(reworkCycles.workItemId, workItemId)).get();
    expect(breakerRow?.bounceCount).toBe(3);
    expect(breakerRow?.escalatedAt).toBeDefined();

    // Verify ADO escalated to Blocked with [rework-escalated]
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const patch = mockWitApi.updateWorkItem.mock.calls[0][1];
    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Blocked');
    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[rework-escalated]');
    expect(tagOp?.value).not.toContain('[awaiting-acceptance]');
    const historyOp = patch.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toContain('<h3>[Rework Escalated] Circuit Breaker Tripped</h3>');
  });

  it('Test 4: [reset-rework] resets bounce counter in SQLite so subsequent rejection is allowed', async () => {
    const workItemId = 6005;

    // Trip circuit breaker to 2 bounces
    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'accept');

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: 3,
        fields: {
          'System.Title': 'Reset Test Ticket',
          'System.State': 'Blocked',
          'System.Tags': 'backend; [rework-escalated]',
          'System.History': 'Tech lead approved reset: [reset-rework]',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    db.insert(dedupEvents)
      .values({
        workItemId,
        revId: 3,
        status: 'pending',
        payloadHash: 'hash-6005',
        receivedAt: new Date(),
      })
      .run();

    await routeWorkItemEvent(workItemId, 3);

    const breakerRow = db.select().from(reworkCycles).where(eq(reworkCycles.workItemId, workItemId)).get();
    expect(breakerRow?.bounceCount).toBe(0);
    expect(breakerRow?.escalatedAt).toBeNull();

    // Subsequent evaluateCircuitBreaker is allowed with count 1
    const nextCheck = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(nextCheck.allowed).toBe(true);
    expect(nextCheck.currentCount).toBe(1);
  });

  it('Test 5: Rework exceeding diff ceiling (<250 LOC) flags ticket Blocked with diff-ceiling', async () => {
    const workItemId = 6006;
    const revId = 2;
    const branchName = `task/ticket-${workItemId}-diff-ceiling-test`;

    try {
      await rootGit.raw(['branch', branchName, 'HEAD']);
    } catch {}

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Diff Ceiling Test',
          'System.State': 'In Dev',
          'System.Tags': 'backend; [awaiting-acceptance]',
          'System.History': 'Needs major overhaul. [reject-acceptance]',
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
        payloadHash: 'hash-6006',
        receivedAt: new Date(),
      })
      .run();

    await routeWorkItemEvent(workItemId, revId, {
      maxDiffLoc: 5,
      mockCodeEdit: async (worktreePath: string) => {
        fs.writeFileSync(
          path.join(worktreePath, 'giant_file.ts'),
          '// line\n'.repeat(50)
        );
      },
    });

    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const lastPatch = updateCalls[updateCalls.length - 1][1];
    const stateOp = lastPatch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Blocked');
    const tagOp = lastPatch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[diff-ceiling-exceeded]');

    const dedup = db.select().from(dedupEvents).where(eq(dedupEvents.workItemId, workItemId)).get();
    expect(dedup?.status).toBe('completed');
  });
});
