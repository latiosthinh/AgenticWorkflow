import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { eq } from 'drizzle-orm';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { PolicyEvaluationStatus } from 'azure-devops-node-api/interfaces/PolicyInterfaces.js';
import { db, sqlite } from '../src/db/index.js';
import { dedupEvents } from '../src/db/schema.js';
import { adoClient } from '../src/ado/client.js';
import {
  buildMergeReadyForQaPatch,
  transitionToReadyForQa,
} from '../src/ado/work-item.js';
import { handlePullRequestEvent } from '../src/ingress/pr-router.js';
import { webhookRoutes, registerPullRequestHandler } from '../src/ingress/routes.js';
import { env } from '../src/config/env.js';

describe('PR Merge Handling & Ready for QA Transition (MRG-05)', () => {
  let mockWitApi: any;
  let mockPolicyApi: any;
  let mockGitApi: any;

  beforeEach(() => {
    sqlite.exec('DELETE FROM dedup_events;');
    vi.clearAllMocks();

    mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: 801,
        rev: 3,
        fields: {
          'System.Title': 'Implement User Registration',
          'System.State': 'Dev Done',
          'System.Tags': '[l3-verified]; [awaiting-acceptance]',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: 801 }),
    };

    mockPolicyApi = {
      getPolicyEvaluations: vi.fn().mockResolvedValue([
        {
          configuration: {
            isBlocking: true,
            type: { displayName: 'Minimum number of reviewers' },
          },
          status: PolicyEvaluationStatus.Approved,
        },
        {
          configuration: {
            isBlocking: true,
            type: { displayName: 'Build validation' },
          },
          status: PolicyEvaluationStatus.Approved,
        },
        {
          configuration: {
            isBlocking: true,
            type: { displayName: 'Security scan status' },
          },
          status: PolicyEvaluationStatus.Approved,
        },
      ]),
    };

    mockGitApi = {
      getPullRequest: vi.fn(),
      getThreads: vi.fn().mockResolvedValue([]),
    };

    adoClient.setWorkItemTrackingApi(mockWitApi);
    adoClient.setPolicyApi(mockPolicyApi);
    adoClient.setGitApi(mockGitApi);
  });

  afterEach(() => {
    adoClient.setWorkItemTrackingApi(null);
    adoClient.setPolicyApi(null);
    adoClient.setGitApi(null);
  });

  describe('buildMergeReadyForQaPatch', () => {
    it('generates patch replacing System.State with "Ready for QA", adding [pr-merged], and removing [awaiting-acceptance]', () => {
      const htmlComment = '<h3>[Merge Summary] Pull Request Merged</h3><!-- [automated-agent] -->';
      const currentTags = '[l3-verified]; [awaiting-acceptance]';

      const patch = buildMergeReadyForQaPatch(htmlComment, currentTags);

      const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
      expect(stateOp).toEqual({
        op: Operation.Replace,
        path: '/fields/System.State',
        value: 'Ready for QA',
      });

      const tagsOp = patch.find((op: any) => op.path === '/fields/System.Tags');
      expect(tagsOp).toBeDefined();
      expect(tagsOp.value).toContain('[l3-verified]');
      expect(tagsOp.value).toContain('[pr-merged]');
      expect(tagsOp.value).not.toContain('[awaiting-acceptance]');

      const historyOp = patch.find((op: any) => op.path === '/fields/System.History');
      expect(historyOp).toEqual({
        op: Operation.Add,
        path: '/fields/System.History',
        value: htmlComment,
      });
    });

    it('handles undefined initial tags gracefully', () => {
      const htmlComment = '<p>Merged</p>';
      const patch = buildMergeReadyForQaPatch(htmlComment, undefined);

      const tagsOp = patch.find((op: any) => op.path === '/fields/System.Tags');
      expect(tagsOp.value).toBe('[pr-merged]');
    });
  });

  describe('transitionToReadyForQa', () => {
    it('fetches work item details and invokes updateWorkItem with Ready for QA patch', async () => {
      const htmlComment = '<h3>[Merge Summary] Merged</h3><!-- [automated-agent] -->';
      await transitionToReadyForQa(801, htmlComment);

      expect(mockWitApi.getWorkItem).toHaveBeenCalledWith(801);
      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);

      const callArgs = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = callArgs.find((a: any) => Array.isArray(a));
      const targetId = callArgs.find((a: any) => typeof a === 'number');
      expect(targetId).toBe(801);

      const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
      expect(stateOp.value).toBe('Ready for QA');
    });
  });

  describe('handlePullRequestEvent for git.pullrequest.merged', () => {
    it('parses PR merge event, verifies branch policies, formats merge summary, and transitions ticket', async () => {
      const workItemId = 801;
      const pullRequestId = 42;
      const mergeCommitSha = '1a2b3c4d5e6f7890abcdef1234567890abcdef12';

      const payload = {
        eventType: 'git.pullrequest.merged',
        resource: {
          pullRequestId,
          title: `AB#${workItemId} - Implement User Registration`,
          url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/42',
          targetRefName: 'refs/heads/main',
          lastMergeCommit: {
            commitId: mergeCommitSha,
          },
          repository: {
            id: 'repo-uuid',
            project: { id: 'proj-uuid' },
          },
        },
      };

      await handlePullRequestEvent(payload);

      expect(mockPolicyApi.getPolicyEvaluations).toHaveBeenCalledWith(
        'proj-uuid',
        `vstfs:///CodeReview/CodeReviewId/proj-uuid/${pullRequestId}`,
        true
      );

      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const callArgs = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = callArgs.find((a: any) => Array.isArray(a));

      const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
      expect(stateOp.value).toBe('Ready for QA');

      const tagsOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
      expect(tagsOp.value).toContain('[pr-merged]');

      const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
      expect(historyOp.value).toContain('<h3>[Merge Summary] Pull Request Merged</h3>');
      expect(historyOp.value).toContain('<strong>Merge Commit:</strong> <code>1a2b3c4d</code>');
      expect(historyOp.value).toContain('<strong>L2 Code Review Gate:</strong> Passed');
      expect(historyOp.value).toContain('<strong>L3 Build Validation Gate:</strong> Passed');
      expect(historyOp.value).toContain('<strong>L4 Security &amp; SAST Gate:</strong> Passed');
      expect(historyOp.value).toContain('Work item transitioned to <strong>Ready for QA</strong>.');
      expect(historyOp.value).toContain('<!-- [automated-agent] -->');
    });

    it('falls back gracefully to completionOptions mergeCommitId if lastMergeCommit is absent', async () => {
      const workItemId = 801;
      const pullRequestId = 45;
      const fallbackSha = 'fedcba9876543210fedcba9876543210fedcba98';

      const payload = {
        eventType: 'git.pullrequest.merged',
        resource: {
          pullRequestId,
          title: `AB#${workItemId} - Fix edge case`,
          targetRefName: 'refs/heads/release/1.0',
          completionOptions: {
            mergeCommitId: fallbackSha,
          },
          repository: {
            id: 'repo-uuid',
            project: { id: 'proj-uuid' },
          },
        },
      };

      await handlePullRequestEvent(payload);

      const callArgs = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = callArgs.find((a: any) => Array.isArray(a));
      const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
      expect(historyOp.value).toContain('<code>fedcba98</code>');
    });
  });

  describe('Fastify Webhook Routing for PR Events', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      await app.register(fastifyRawBody, {
        field: 'rawBody',
        global: false,
        encoding: 'utf8',
        runFirst: true,
      });
      await app.register(webhookRoutes);
      await app.ready();
    });

    afterEach(async () => {
      registerPullRequestHandler(handlePullRequestEvent);
      await app.close();
    });

    function createSignature(payload: string, secret = env.ADO_WEBHOOK_SECRET): string {
      const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      return `sha256=${hash}`;
    }

    it('accepts git.pullrequest.merged event and acknowledges HTTP 202 Accepted', async () => {
      const mockPrHandler = vi.fn().mockResolvedValue(undefined);
      registerPullRequestHandler(mockPrHandler);

      const rawPayload = JSON.stringify({
        eventType: 'git.pullrequest.merged',
        resource: {
          pullRequestId: 99,
          title: 'AB#801 - Implement feature',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ado/webhook',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': createSignature(rawPayload),
        },
        payload: rawPayload,
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({
        status: 'accepted',
        workItemId: 801,
        pullRequestId: 99,
      });

      // Wait for queue lane processing
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockPrHandler).toHaveBeenCalledTimes(1);

      // Verify dedup record was created and updated to completed
      const events = db
        .select()
        .from(dedupEvents)
        .where(eq(dedupEvents.workItemId, 801))
        .all();
      expect(events.length).toBe(1);
      expect(events[0].status).toBe('completed');
    });

    it('deduplicates identical PR deliveries with HTTP 200 duplicate_ignored (T-05-12 mitigation)', async () => {
      const mockPrHandler = vi.fn().mockResolvedValue(undefined);
      registerPullRequestHandler(mockPrHandler);

      const rawPayload = JSON.stringify({
        eventType: 'git.pullrequest.merged',
        resource: {
          pullRequestId: 100,
          title: 'AB#801 - Redundant PR delivery',
        },
      });

      const response1 = await app.inject({
        method: 'POST',
        url: '/api/ado/webhook',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': createSignature(rawPayload),
        },
        payload: rawPayload,
      });
      expect(response1.statusCode).toBe(202);

      // Immediate duplicate replay
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/ado/webhook',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': createSignature(rawPayload),
        },
        payload: rawPayload,
      });
      expect(response2.statusCode).toBe(200);
      expect(response2.json()).toEqual({ status: 'duplicate_ignored' });
    });

    it('rejects forged HMAC signature on git.pullrequest.merged with HTTP 401 (T-05-09 mitigation)', async () => {
      const rawPayload = JSON.stringify({
        eventType: 'git.pullrequest.merged',
        resource: {
          pullRequestId: 101,
          title: 'AB#801 - Forged signature',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ado/webhook',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': createSignature(rawPayload, 'wrong-secret'),
        },
        payload: rawPayload,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid HMAC signature' });
    });
  });
});
