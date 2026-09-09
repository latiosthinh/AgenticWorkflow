import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sqlite } from '../src/db/index.js';
import { reworkCycles, dedupEvents } from '../src/db/schema.js';
import { adoClient } from '../src/ado/client.js';
import { handlePullRequestEvent, extractWorkItemId } from '../src/ingress/pr-router.js';
import { evaluateCircuitBreaker, resetCircuitBreaker } from '../src/accept/breaker.js';
import { processWorkItemRework } from '../src/execute/rework-worker.js';
import { CommentThreadStatus } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { env } from '../src/config/env.js';

vi.mock('../src/execute/rework-worker.js', () => ({
  processWorkItemRework: vi.fn().mockResolvedValue(undefined),
}));

describe('PR Review Rejection & Shared Circuit Breaker (MRG-04)', () => {
  let mockGitApi: any;
  let mockWitApi: any;

  beforeEach(() => {
    sqlite.exec('DELETE FROM rework_cycles;');
    sqlite.exec('DELETE FROM dedup_events;');
    vi.clearAllMocks();

    mockGitApi = {
      getThreads: vi.fn().mockResolvedValue([]),
    };
    mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: 701,
        rev: 2,
        fields: {
          'System.Title': 'Implement Auth feature',
          'System.State': 'Dev Done',
          'System.Tags': '[awaiting-acceptance]',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: 701 }),
    };

    adoClient.setGitApi(mockGitApi);
    adoClient.setWorkItemTrackingApi(mockWitApi);
  });

  afterEach(() => {
    adoClient.setGitApi(null);
    adoClient.setWorkItemTrackingApi(null);
  });

  describe('extractWorkItemId', () => {
    it('extracts ID from PR title containing AB#<id>', () => {
      expect(extractWorkItemId({ title: 'AB#123 Fix login bug' })).toBe(123);
      expect(extractWorkItemId({ title: 'feat: new api (AB#4567)' })).toBe(4567);
      expect(extractWorkItemId({ title: 'No work item in title' })).toBeUndefined();
    });

    it('falls back to workItemRefs when title lacks AB# pattern', () => {
      expect(
        extractWorkItemId({
          title: 'Update readme',
          workItemRefs: [{ id: '890' }],
        })
      ).toBe(890);

      expect(
        extractWorkItemId({
          title: 'Update readme',
          workItemRefs: [{ url: 'https://dev.azure.com/org/proj/_apis/wit/workItems/999' }],
        })
      ).toBe(999);
    });
  });

  describe('PR Review Rejection Handling', () => {
    it('ignores PR updated event when all reviewer votes are non-negative', async () => {
      const payload = {
        eventType: 'git.pullrequest.updated',
        resource: {
          pullRequestId: 10,
          title: 'AB#701 - Implement Auth feature',
          reviewers: [
            { id: 'rev-1', vote: 10 }, // Approved
            { id: 'rev-2', vote: 5 },  // Approved with suggestions
            { id: 'rev-3', vote: 0 },  // No vote
          ],
        },
      };

      await handlePullRequestEvent(payload);

      expect(processWorkItemRework).not.toHaveBeenCalled();
      expect(mockWitApi.updateWorkItem).not.toHaveBeenCalled();
    });

    it('triggers rework when reviewer votes -10 (rejected) and bounce count <= 2', async () => {
      const workItemId = 701;
      const pullRequestId = 10;

      mockGitApi.getThreads.mockResolvedValue([
        {
          id: 1,
          status: CommentThreadStatus.Active,
          threadContext: { filePath: '/src/auth.ts', rightFileStart: { line: 42 } },
          comments: [
            {
              id: 101,
              content: 'Please use constant-time comparison here to avoid timing attacks.',
              author: { id: 'reviewer-guid', displayName: 'Security Reviewer' },
            },
            {
              id: 102,
              content: 'Previous automated remark <!-- [automated-agent] -->',
              author: { id: 'reviewer-guid', displayName: 'Security Reviewer' },
            },
            {
              id: 103,
              content: 'Bot echo',
              author: { id: env.ADO_BOT_ID, displayName: 'Workflow Bot' },
            },
          ],
        },
      ]);

      const payload = {
        eventType: 'git.pullrequest.updated',
        resource: {
          pullRequestId,
          title: `AB#${workItemId} - Implement Auth feature`,
          repository: { id: 'repo-1', project: { id: 'proj-1' } },
          reviewers: [{ id: 'rev-1', vote: -10 }],
        },
      };

      await handlePullRequestEvent(payload);

      // Verify circuit breaker incremented to 1
      const cycle = db
        .select()
        .from(reworkCycles)
        .where(eq(reworkCycles.workItemId, workItemId))
        .get();
      expect(cycle?.bounceCount).toBe(1);
      expect(cycle?.sourceGate).toBe('pr_review');

      // Verify rework worker invoked with filtered feedback
      expect(processWorkItemRework).toHaveBeenCalledTimes(1);
      const [calledWorkItemId, calledRevId, feedback] = (processWorkItemRework as any).mock.calls[0];
      expect(calledWorkItemId).toBe(workItemId);
      expect(calledRevId).toBe(2);

      // Verify feedback is wrapped in XML boundaries and strips bot comments & automated markers
      expect(feedback).toContain('<pr_review_feedback>');
      expect(feedback).toContain('File: /src/auth.ts:42');
      expect(feedback).toContain('Author: Security Reviewer');
      expect(feedback).toContain('Please use constant-time comparison here');
      expect(feedback).not.toContain('Previous automated remark');
      expect(feedback).not.toContain('Bot echo');
      expect(feedback).toContain('</pr_review_feedback>');
    });

    it('triggers rework when reviewer votes -5 (waiting for author)', async () => {
      const workItemId = 701;
      const pullRequestId = 12;

      mockGitApi.getThreads.mockResolvedValue([
        {
          id: 1,
          status: CommentThreadStatus.Active,
          threadContext: { filePath: '/src/api.ts', rightFileStart: { line: 15 } },
          comments: [
            {
              id: 201,
              content: 'Add validation for missing payload fields',
              author: { id: 'senior-dev', displayName: 'Senior Dev' },
            },
          ],
        },
      ]);

      const payload = {
        eventType: 'git.pullrequest.updated',
        resource: {
          pullRequestId,
          title: `AB#${workItemId} - Implement Auth feature`,
          repository: { id: 'repo-1', project: { id: 'proj-1' } },
          reviewers: [{ id: 'rev-1', vote: -5 }],
        },
      };

      await handlePullRequestEvent(payload);

      expect(processWorkItemRework).toHaveBeenCalledTimes(1);
      const cycle = db
        .select()
        .from(reworkCycles)
        .where(eq(reworkCycles.workItemId, workItemId))
        .get();
      expect(cycle?.bounceCount).toBe(1);
    });

    it('enforces shared circuit breaker: bounce 1 (accept), bounce 2 (pr_review), bounce 3 trips breaker to Blocked with [rework-escalated]', async () => {
      const workItemId = 701;

      // Bounce 1: through accept gate
      const first = await evaluateCircuitBreaker(workItemId, 'accept');
      expect(first.allowed).toBe(true);
      expect(first.currentCount).toBe(1);

      // Bounce 2: through PR review rejection
      const payloadBounce2 = {
        eventType: 'git.pullrequest.updated',
        resource: {
          pullRequestId: 20,
          title: `AB#${workItemId} - Implement Auth feature`,
          repository: { id: 'repo-1', project: { id: 'proj-1' } },
          reviewers: [{ id: 'reviewer-1', vote: -10 }],
        },
      };

      await handlePullRequestEvent(payloadBounce2);
      expect(processWorkItemRework).toHaveBeenCalledTimes(1);

      const cycleAfterBounce2 = db
        .select()
        .from(reworkCycles)
        .where(eq(reworkCycles.workItemId, workItemId))
        .get();
      expect(cycleAfterBounce2?.bounceCount).toBe(2);

      // Bounce 3: another PR review rejection trips the shared breaker
      vi.clearAllMocks();
      const payloadBounce3 = {
        eventType: 'git.pullrequest.updated',
        resource: {
          pullRequestId: 20,
          title: `AB#${workItemId} - Implement Auth feature`,
          repository: { id: 'repo-1', project: { id: 'proj-1' } },
          reviewers: [{ id: 'reviewer-1', vote: -10 }],
        },
      };

      await handlePullRequestEvent(payloadBounce3);

      // Rework worker must NOT be called on 3rd bounce
      expect(processWorkItemRework).not.toHaveBeenCalled();

      // Work item should be escalated to Blocked with [rework-escalated]
      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const callArgs = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = callArgs.find((a: any) => Array.isArray(a));
      const targetId = callArgs.find((a: any) => typeof a === 'number');
      expect(targetId).toBe(workItemId);

      const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
      expect(stateOp).toEqual({
        op: Operation.Replace,
        path: '/fields/System.State',
        value: 'Blocked',
      });

      const tagsOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
      expect(tagsOp.value).toContain('[rework-escalated]');
      expect(tagsOp.value).not.toContain('[awaiting-acceptance]');

      const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
      expect(historyOp.value).toContain('[Rework Escalated] Circuit Breaker Tripped');
      expect(historyOp.value).toContain('3 automated rework bounces');
      expect(historyOp.value).toContain('<!-- [automated-agent] -->');
    });

    it('strips dangerous HTML/script tags from review comments (T-05-10 mitigation)', async () => {
      const workItemId = 701;
      const pullRequestId = 30;

      mockGitApi.getThreads.mockResolvedValue([
        {
          id: 1,
          status: CommentThreadStatus.Active,
          threadContext: { filePath: '/src/view.ts', rightFileStart: { line: 10 } },
          comments: [
            {
              id: 301,
              content: 'Fix this: <script>alert("pwned")</script> <img src=x onerror=alert(1)> normal text here',
              author: { id: 'reviewer-1', displayName: 'Code Reviewer' },
            },
          ],
        },
      ]);

      const payload = {
        eventType: 'git.pullrequest.updated',
        resource: {
          pullRequestId,
          title: `AB#${workItemId} - Implement Auth feature`,
          repository: { id: 'repo-1', project: { id: 'proj-1' } },
          reviewers: [{ id: 'rev-1', vote: -10 }],
        },
      };

      await handlePullRequestEvent(payload);

      expect(processWorkItemRework).toHaveBeenCalledTimes(1);
      const [, , feedback] = (processWorkItemRework as any).mock.calls[0];
      expect(feedback).not.toContain('<script>');
      expect(feedback).not.toContain('alert("pwned")');
      expect(feedback).not.toContain('<img');
      expect(feedback).toContain('normal text here');
    });
  });
});
