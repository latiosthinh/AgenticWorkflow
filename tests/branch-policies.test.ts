import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PolicyEvaluationStatus } from 'azure-devops-node-api/interfaces/PolicyInterfaces.js';
import { CommentThreadStatus } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { adoClient } from '../src/ado/client.js';
import {
  verifyBranchPolicies,
  evaluateMergeReadiness,
  type PolicyGateStatus,
} from '../src/ado/policy.js';
import { extractActiveReviewComments } from '../src/ado/threads.js';

describe('Branch Policies & Merge Readiness (MRG-02 & MRG-03)', () => {
  beforeEach(() => {
    adoClient.setPolicyApi(null);
    adoClient.setGitApi(null);
  });

  describe('verifyBranchPolicies', () => {
    it('returns allApproved: true when all blocking policies are Approved (L2, L3, L4)', async () => {
      const mockPolicyApi = {
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

      adoClient.setPolicyApi(mockPolicyApi as any);

      const status = await verifyBranchPolicies('proj-alpha', 42);

      expect(status.allApproved).toBe(true);
      expect(status.pendingCount).toBe(0);
      expect(status.failedCount).toBe(0);
      expect(status.l2ReviewersPassed).toBe(true);
      expect(status.l3BuildPassed).toBe(true);
      expect(status.l4SecurityPassed).toBe(true);
      expect(status.summary).toHaveLength(3);
    });

    it('flags pending and blocks allApproved when build validation (L3) is Running or Queued', async () => {
      const mockPolicyApi = {
        getPolicyEvaluations: vi.fn().mockResolvedValue([
          {
            configuration: {
              isBlocking: true,
              type: { displayName: 'Build validation' },
            },
            status: PolicyEvaluationStatus.Running,
          },
          {
            configuration: {
              isBlocking: true,
              type: { displayName: 'Reviewers' },
            },
            status: PolicyEvaluationStatus.Approved,
          },
          {
            configuration: {
              isBlocking: true,
              type: { displayName: 'Security' },
            },
            status: PolicyEvaluationStatus.Approved,
          },
        ]),
      };

      adoClient.setPolicyApi(mockPolicyApi as any);

      const status = await verifyBranchPolicies('proj-alpha', 42);

      expect(status.allApproved).toBe(false);
      expect(status.pendingCount).toBe(1);
      expect(status.failedCount).toBe(0);
      expect(status.l3BuildPassed).toBe(false);
      expect(status.l2ReviewersPassed).toBe(true);
      expect(status.l4SecurityPassed).toBe(true);
      expect(status.summary).toContain('Build validation: Running');
    });

    it('flags failed and blocks allApproved when security policy (L4) is Rejected or Broken', async () => {
      const mockPolicyApi = {
        getPolicyEvaluations: vi.fn().mockResolvedValue([
          {
            configuration: {
              isBlocking: true,
              type: { displayName: 'Security SAST scan' },
            },
            status: PolicyEvaluationStatus.Rejected,
          },
          {
            configuration: {
              isBlocking: true,
              type: { displayName: 'Code quality' },
            },
            status: PolicyEvaluationStatus.Broken,
          },
          {
            configuration: {
              isBlocking: true,
              type: { displayName: 'Build validation' },
            },
            status: PolicyEvaluationStatus.Approved,
          },
        ]),
      };

      adoClient.setPolicyApi(mockPolicyApi as any);

      const status = await verifyBranchPolicies('proj-alpha', 42);

      expect(status.allApproved).toBe(false);
      expect(status.pendingCount).toBe(0);
      expect(status.failedCount).toBe(2);
      expect(status.l4SecurityPassed).toBe(false);
      expect(status.l2ReviewersPassed).toBe(false);
      expect(status.l3BuildPassed).toBe(true);
    });

    it('formats artifact URI using vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}', async () => {
      const mockPolicyApi = {
        getPolicyEvaluations: vi.fn().mockResolvedValue([]),
      };

      adoClient.setPolicyApi(mockPolicyApi as any);

      await verifyBranchPolicies('proj-123', 99);

      expect(mockPolicyApi.getPolicyEvaluations).toHaveBeenCalledWith(
        'proj-123',
        'vstfs:///CodeReview/CodeReviewId/proj-123/99',
        true
      );
    });

    it('ignores non-blocking and NotApplicable policies during evaluation', async () => {
      const mockPolicyApi = {
        getPolicyEvaluations: vi.fn().mockResolvedValue([
          {
            configuration: {
              isBlocking: false,
              type: { displayName: 'Optional Advisory Check' },
            },
            status: PolicyEvaluationStatus.Rejected,
          },
          {
            configuration: {
              isBlocking: true,
              type: { displayName: 'Conditional Security' },
            },
            status: PolicyEvaluationStatus.NotApplicable,
          },
          {
            configuration: {
              isBlocking: true,
              type: { displayName: 'Reviewers' },
            },
            status: PolicyEvaluationStatus.Approved,
          },
        ]),
      };

      adoClient.setPolicyApi(mockPolicyApi as any);

      const status = await verifyBranchPolicies('proj-beta', 10);

      expect(status.allApproved).toBe(true);
      expect(status.failedCount).toBe(0);
      expect(status.pendingCount).toBe(0);
      expect(status.summary).toHaveLength(1);
      expect(status.summary[0]).toContain('Reviewers: Approved');
    });
  });

  describe('evaluateMergeReadiness', () => {
    const greenPolicyStatus: PolicyGateStatus = {
      allApproved: true,
      pendingCount: 0,
      failedCount: 0,
      l2ReviewersPassed: true,
      l3BuildPassed: true,
      l4SecurityPassed: true,
      summary: ['All policies approved'],
    };

    it('allows merge when acceptance tag is present, reviewer approved (>= 5), and policies green', () => {
      const readiness = evaluateMergeReadiness({
        workItemTags: 'frontend; [acceptance-approved]; sprint-10',
        reviewerVotes: [{ vote: 10 }],
        policyStatus: greenPolicyStatus,
      });

      expect(readiness.canMerge).toBe(true);
      expect(readiness.acceptanceApproved).toBe(true);
      expect(readiness.reviewerApproved).toBe(true);
      expect(readiness.policiesGreen).toBe(true);
      expect(readiness.reasons).toHaveLength(0);
    });

    it('allows merge with vote: 5 (approved with suggestions)', () => {
      const readiness = evaluateMergeReadiness({
        workItemTags: '[acceptance-approved]',
        reviewerVotes: [{ vote: 5 }],
        policyStatus: greenPolicyStatus,
      });

      expect(readiness.canMerge).toBe(true);
      expect(readiness.reviewerApproved).toBe(true);
    });

    it('blocks merge when [acceptance-approved] tag is missing', () => {
      const readiness = evaluateMergeReadiness({
        workItemTags: 'frontend; [awaiting-acceptance]',
        reviewerVotes: [{ vote: 10 }],
        policyStatus: greenPolicyStatus,
      });

      expect(readiness.canMerge).toBe(false);
      expect(readiness.acceptanceApproved).toBe(false);
      expect(readiness.reasons).toContain('Work item lacks [acceptance-approved] tag');
    });

    it('blocks merge when reviewer vote is 0 or missing approval (vote < 5)', () => {
      const readiness = evaluateMergeReadiness({
        workItemTags: '[acceptance-approved]',
        reviewerVotes: [{ vote: 0 }],
        policyStatus: greenPolicyStatus,
      });

      expect(readiness.canMerge).toBe(false);
      expect(readiness.reviewerApproved).toBe(false);
      expect(readiness.reasons).toContain('PR lacks reviewer approval (vote >= 5)');
    });

    it('blocks merge when a reviewer rejects or votes waitingForAuthor (< 0)', () => {
      const readiness = evaluateMergeReadiness({
        workItemTags: '[acceptance-approved]',
        reviewerVotes: [{ vote: 10 }, { vote: -5 }], // Approved by one, rejected/waiting by another
        policyStatus: greenPolicyStatus,
      });

      expect(readiness.canMerge).toBe(false);
      expect(readiness.reviewerApproved).toBe(false);
      expect(readiness.reasons).toContain('PR has rejecting reviewer votes');
    });

    it('blocks merge when branch policies are not green', () => {
      const pendingPolicyStatus: PolicyGateStatus = {
        allApproved: false,
        pendingCount: 1,
        failedCount: 0,
        l2ReviewersPassed: true,
        l3BuildPassed: false,
        l4SecurityPassed: true,
        summary: ['Build: Running'],
      };

      const readiness = evaluateMergeReadiness({
        workItemTags: '[acceptance-approved]',
        reviewerVotes: [{ vote: 10 }],
        policyStatus: pendingPolicyStatus,
      });

      expect(readiness.canMerge).toBe(false);
      expect(readiness.policiesGreen).toBe(false);
      expect(readiness.reasons).toContain('Branch policies are not all approved');
    });

    it('aggregates multiple reasons when multiple merge conditions fail', () => {
      const readiness = evaluateMergeReadiness({
        workItemTags: 'bug',
        reviewerVotes: [{ vote: -10 }],
        policyStatus: {
          allApproved: false,
          pendingCount: 0,
          failedCount: 1,
          l2ReviewersPassed: false,
          l3BuildPassed: true,
          l4SecurityPassed: true,
          summary: ['Reviewers: Rejected'],
        },
      });

      expect(readiness.canMerge).toBe(false);
      expect(readiness.reasons).toHaveLength(3);
      expect(readiness.reasons).toContain('Work item lacks [acceptance-approved] tag');
      expect(readiness.reasons).toContain('PR has rejecting reviewer votes');
      expect(readiness.reasons).toContain('Branch policies are not all approved');
    });
  });

  describe('extractActiveReviewComments', () => {
    it('extracts active review comments with file paths and line numbers', async () => {
      const mockGitApi = {
        getThreads: vi.fn().mockResolvedValue([
          {
            id: 101,
            status: CommentThreadStatus.Active,
            threadContext: {
              filePath: '/src/index.ts',
              rightFileStart: { line: 42, offset: 1 },
            },
            comments: [
              {
                id: 1,
                author: { id: 'user-1', displayName: 'Alice Dev' },
                content: 'Refactor this loop to avoid O(N^2) complexity.',
              },
            ],
          },
        ]),
      };

      adoClient.setGitApi(mockGitApi as any);

      const comments = await extractActiveReviewComments('repo-1', 5, 'proj-1');

      expect(comments).toHaveLength(1);
      expect(comments[0]).toEqual({
        filePath: '/src/index.ts',
        lineNumber: 42,
        author: 'Alice Dev',
        content: 'Refactor this loop to avoid O(N^2) complexity.',
      });
    });

    it('falls back to leftFileStart line number or "General Comment" when coordinates missing', async () => {
      const mockGitApi = {
        getThreads: vi.fn().mockResolvedValue([
          {
            id: 102,
            status: CommentThreadStatus.Active,
            threadContext: {
              filePath: '/src/legacy.ts',
              leftFileStart: { line: 18 },
            },
            comments: [
              {
                id: 1,
                author: { id: 'user-2', displayName: 'Bob Architect' },
                content: 'Line 18 is deprecated.',
              },
            ],
          },
          {
            id: 103,
            status: CommentThreadStatus.Active,
            // no threadContext
            comments: [
              {
                id: 2,
                author: { id: 'user-3', displayName: 'Carol Lead' },
                content: 'Overall PR architecture looks good.',
              },
            ],
          },
        ]),
      };

      adoClient.setGitApi(mockGitApi as any);

      const comments = await extractActiveReviewComments('repo-1', 5, 'proj-1');

      expect(comments).toHaveLength(2);
      expect(comments[0]).toEqual({
        filePath: '/src/legacy.ts',
        lineNumber: 18,
        author: 'Bob Architect',
        content: 'Line 18 is deprecated.',
      });
      expect(comments[1]).toEqual({
        filePath: 'General Comment',
        lineNumber: undefined,
        author: 'Carol Lead',
        content: 'Overall PR architecture looks good.',
      });
    });

    it('filters out resolved threads (Fixed, Closed, ByDesign) and deleted threads/comments', async () => {
      const mockGitApi = {
        getThreads: vi.fn().mockResolvedValue([
          {
            id: 201,
            status: CommentThreadStatus.Fixed,
            threadContext: { filePath: '/src/fixed.ts' },
            comments: [{ id: 1, content: 'This was fixed.' }],
          },
          {
            id: 202,
            status: CommentThreadStatus.Closed,
            threadContext: { filePath: '/src/closed.ts' },
            comments: [{ id: 2, content: 'This was closed.' }],
          },
          {
            id: 203,
            status: CommentThreadStatus.ByDesign,
            threadContext: { filePath: '/src/bydesign.ts' },
            comments: [{ id: 3, content: 'Works by design.' }],
          },
          {
            id: 204,
            isDeleted: true,
            status: CommentThreadStatus.Active,
            threadContext: { filePath: '/src/deleted-thread.ts' },
            comments: [{ id: 4, content: 'Thread was deleted.' }],
          },
          {
            id: 205,
            status: CommentThreadStatus.Active,
            threadContext: { filePath: '/src/deleted-comment.ts' },
            comments: [{ id: 5, isDeleted: true, content: 'Comment was deleted.' }],
          },
        ]),
      };

      adoClient.setGitApi(mockGitApi as any);

      const comments = await extractActiveReviewComments('repo-1', 5, 'proj-1');
      expect(comments).toHaveLength(0);
    });

    it('filters out comments authored by botId or containing <!-- [automated-agent] -->', async () => {
      const botId = 'bot-guid-12345';
      const mockGitApi = {
        getThreads: vi.fn().mockResolvedValue([
          {
            id: 301,
            status: CommentThreadStatus.Active,
            threadContext: { filePath: '/src/worker.ts', rightFileStart: { line: 10 } },
            comments: [
              {
                id: 1,
                author: { id: botId, displayName: 'Auto Agent' },
                content: 'Automated verification feedback.',
              },
              {
                id: 2,
                author: { id: 'human-dev', displayName: 'Dave' },
                content: 'Previous automated output: <p>Diff summary</p><!-- [automated-agent] -->',
              },
              {
                id: 3,
                author: { id: 'human-dev', displayName: 'Dave' },
                content: 'Please fix the memory leak on line 10.',
              },
            ],
          },
        ]),
      };

      adoClient.setGitApi(mockGitApi as any);

      const comments = await extractActiveReviewComments('repo-1', 5, 'proj-1', botId);

      expect(comments).toHaveLength(1);
      expect(comments[0]).toEqual({
        filePath: '/src/worker.ts',
        lineNumber: 10,
        author: 'Dave',
        content: 'Please fix the memory leak on line 10.',
      });
    });
  });
});
