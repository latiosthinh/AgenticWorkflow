import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adoClient } from '../src/ado/client.js';
import {
  formatPrDescription,
  formatMergeSummaryComment,
  type PrDescriptionOptions,
  type MergeSummaryCommentOptions,
} from '../src/ado/formatter.js';
import { createOrGetPullRequest, getPullRequest } from '../src/ado/git.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import type { GitPullRequest } from 'azure-devops-node-api/interfaces/GitInterfaces.js';

describe('PR Lifecycle & Git Operations (MRG-01)', () => {
  describe('formatPrDescription', () => {
    it('formats structured markdown with AB# header, L1 checklist, L3 results, and loop shield', () => {
      const options: PrDescriptionOptions = {
        workItemId: 101,
        title: 'Implement User Auth Flow',
        acceptanceCriteria: 'Given valid JWT token, return 200 OK with user profile',
        testSummary: {
          suite: 'auth.test.ts',
          totalTests: 8,
          passed: 8,
          failed: 0,
          durationMs: 350,
        },
        diffStat: {
          totalLoc: 185,
          filesChanged: 4,
        },
      };

      const md = formatPrDescription(options);

      expect(md).toContain('## AB#101 - Implement User Auth Flow');
      expect(md).toContain('### L1 Requirements Verification');
      expect(md).toContain('<250 LOC');
      expect(md).toContain('`185` LOC across 4 files');
      expect(md).toContain('Test assertion files protected and unmodified');
      expect(md).toContain('> Given valid JWT token, return 200 OK with user profile');
      expect(md).toContain('### L3 Functional Evidence (Local Pre-PR)');
      expect(md).toContain('`auth.test.ts`');
      expect(md).toContain('**8/8 passed** (0 failed)');
      expect(md).toContain('`350ms`');
      expect(md.endsWith('<!-- [automated-agent] -->')).toBe(true);
    });

    it('handles multiline acceptance criteria with blockquote indenting', () => {
      const options: PrDescriptionOptions = {
        workItemId: 202,
        title: 'Multi-criteria Feature',
        acceptanceCriteria: 'Rule 1: Fast response\nRule 2: Secure storage',
        testSummary: {
          suite: 'feature.test.ts',
          totalTests: 5,
          passed: 5,
          failed: 0,
          durationMs: 120,
        },
        diffStat: {
          totalLoc: 50,
          filesChanged: 2,
        },
      };

      const md = formatPrDescription(options);
      expect(md).toContain('> Rule 1: Fast response\n> Rule 2: Secure storage');
    });
  });

  describe('formatMergeSummaryComment', () => {
    it('generates sanitized HTML comment with commit SHA, target branch, and policy status', () => {
      const options: MergeSummaryCommentOptions = {
        pullRequestId: 456,
        prUrl: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/456',
        mergeCommitSha: 'a1b2c3d4e5f678901234',
        targetBranch: 'main',
        policies: {
          l2Reviewers: true,
          l3Build: true,
          l4Security: true,
        },
      };

      const html = formatMergeSummaryComment(options);

      expect(html).toContain('<h3>[Merge Summary] Pull Request Merged</h3>');
      expect(html).toContain(
        'Pull Request <a href="https://dev.azure.com/org/proj/_git/repo/pullrequest/456">#456</a>'
      );
      expect(html).toContain('merged into <code>main</code>');
      expect(html).toContain('<strong>Merge Commit:</strong> <code>a1b2c3d4</code>');
      expect(html).toContain('<strong>L2 Code Review Gate:</strong> Passed');
      expect(html).toContain('<strong>L3 Build Validation Gate:</strong> Passed');
      expect(html).toContain('<strong>L4 Security &amp; SAST Gate:</strong> Passed');
      expect(html).toContain('Work item transitioned to <strong>Ready for QA</strong>.');
      expect(html.endsWith('<!-- [automated-agent] -->')).toBe(true);
    });

    it('renders N/A for policies that were not passed or not evaluated', () => {
      const options: MergeSummaryCommentOptions = {
        pullRequestId: 457,
        prUrl: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/457',
        mergeCommitSha: '9876543210abcdef',
        targetBranch: 'release/v1',
        policies: {
          l2Reviewers: true,
          l3Build: false,
          l4Security: false,
        },
      };

      const html = formatMergeSummaryComment(options);
      expect(html).toContain('<strong>L2 Code Review Gate:</strong> Passed');
      expect(html).toContain('<strong>L3 Build Validation Gate:</strong> N/A');
      expect(html).toContain('<strong>L4 Security &amp; SAST Gate:</strong> N/A');
    });
  });

  describe('createOrGetPullRequest', () => {
    const mockProjectId = 'proj-uuid-123';
    const mockRepoId = 'repo-uuid-456';

    let mockGitApi: any;
    let mockWitApi: any;

    beforeEach(() => {
      mockGitApi = {
        getPullRequests: vi.fn(),
        createPullRequest: vi.fn(),
        getPullRequest: vi.fn(),
      };
      mockWitApi = {
        getWorkItem: vi.fn(),
        updateWorkItem: vi.fn(),
      };
      adoClient.setGitApi(mockGitApi);
      adoClient.setWorkItemTrackingApi(mockWitApi);
    });

    it('returns existing active PR without creating a duplicate', async () => {
      const existingPr: GitPullRequest = {
        pullRequestId: 789,
        title: 'AB#101 - Existing Active PR',
        sourceRefName: 'refs/heads/task/ticket-101-auth',
        targetRefName: 'refs/heads/main',
        status: 1,
      };

      mockGitApi.getPullRequests.mockResolvedValue([existingPr]);

      const result = await createOrGetPullRequest({
        workItemId: 101,
        title: 'Existing Active PR',
        sourceBranch: 'task/ticket-101-auth',
        description: 'PR Description',
        projectId: mockProjectId,
        repositoryId: mockRepoId,
      });

      expect(result).toBe(existingPr);
      expect(mockGitApi.getPullRequests).toHaveBeenCalledWith(
        mockRepoId,
        {
          sourceRefName: 'refs/heads/task/ticket-101-auth',
          targetRefName: 'refs/heads/main',
          status: 1,
        },
        mockProjectId
      );
      expect(mockGitApi.createPullRequest).not.toHaveBeenCalled();
      expect(mockWitApi.updateWorkItem).not.toHaveBeenCalled();
    });

    it('creates new PR with AB# title and registers ArtifactLink on work item when no active PR exists', async () => {
      mockGitApi.getPullRequests.mockResolvedValue([]);

      const createdPr: GitPullRequest = {
        pullRequestId: 999,
        title: 'AB#101 - Implement User Auth Flow',
        sourceRefName: 'refs/heads/task/ticket-101-auth',
        targetRefName: 'refs/heads/main',
      };

      mockGitApi.createPullRequest.mockResolvedValue(createdPr);
      mockWitApi.updateWorkItem.mockResolvedValue({ id: 101 });

      const result = await createOrGetPullRequest({
        workItemId: 101,
        title: 'Implement User Auth Flow',
        sourceBranch: 'refs/heads/task/ticket-101-auth',
        targetBranch: 'main',
        description: '## PR Body',
        projectId: mockProjectId,
        repositoryId: mockRepoId,
      });

      expect(result).toBe(createdPr);

      // Verify PR creation arguments
      expect(mockGitApi.createPullRequest).toHaveBeenCalledWith(
        {
          sourceRefName: 'refs/heads/task/ticket-101-auth',
          targetRefName: 'refs/heads/main',
          title: 'AB#101 - Implement User Auth Flow',
          description: '## PR Body',
        },
        mockRepoId,
        mockProjectId
      );

      // Verify ArtifactLink registration on Work Item
      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const callArgs = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = callArgs.find((a: any) => Array.isArray(a));
      expect(patchDoc).toBeDefined();
      expect(patchDoc).toEqual([
        {
          op: Operation.Add,
          path: '/relations/-',
          value: {
            rel: 'ArtifactLink',
            url: `vstfs:///Git/PullRequestId/${mockProjectId}/${mockRepoId}/999`,
            attributes: {
              name: 'Pull Request',
              comment: 'Linked Pull Request #999',
            },
          },
        },
      ]);
    });

    it('normalizes branch names with or without refs/heads/ prefix', async () => {
      mockGitApi.getPullRequests.mockResolvedValue([]);
      mockGitApi.createPullRequest.mockResolvedValue({ pullRequestId: 123 });
      mockWitApi.updateWorkItem.mockResolvedValue({ id: 105 });

      await createOrGetPullRequest({
        workItemId: 105,
        title: 'Fix issue',
        sourceBranch: 'feature/branch',
        targetBranch: 'refs/heads/release/v1',
        description: 'Fix',
        projectId: mockProjectId,
        repositoryId: mockRepoId,
      });

      expect(mockGitApi.createPullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceRefName: 'refs/heads/feature/branch',
          targetRefName: 'refs/heads/release/v1',
        }),
        mockRepoId,
        mockProjectId
      );
    });
  });

  describe('getPullRequest', () => {
    it('retrieves pull request by ID via GitApi with retry', async () => {
      const mockGitApi = {
        getPullRequest: vi.fn().mockResolvedValue({
          pullRequestId: 555,
          status: 1,
        }),
      };
      adoClient.setGitApi(mockGitApi as any);

      const pr = await getPullRequest('repo-1', 555, 'proj-1');

      expect(pr.pullRequestId).toBe(555);
      expect(mockGitApi.getPullRequest).toHaveBeenCalledWith('repo-1', 555, 'proj-1');
    });
  });
});
