import type { GitPullRequest } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { adoClient, withRetry } from './client.js';

export async function getPullRequest(
  repositoryId: string,
  pullRequestId: number,
  projectId: string
): Promise<GitPullRequest> {
  const gitApi = await adoClient.getGitApi();
  return withRetry(() => gitApi.getPullRequest(repositoryId, pullRequestId, projectId));
}

export async function createOrGetPullRequest(params: {
  workItemId: number;
  title: string;
  sourceBranch: string;
  targetBranch?: string;
  description: string;
  projectId: string;
  repositoryId: string;
}): Promise<GitPullRequest> {
  const gitApi = await adoClient.getGitApi();
  const sourceRefName = `refs/heads/${params.sourceBranch.replace(/^refs\/heads\//, '')}`;
  const targetRefName = `refs/heads/${(params.targetBranch || 'main').replace(/^refs\/heads\//, '')}`;

  const existingPrs = await withRetry(() =>
    gitApi.getPullRequests(
      params.repositoryId,
      {
        sourceRefName,
        targetRefName,
        status: 1, // Active
      },
      params.projectId
    )
  );

  if (existingPrs && existingPrs.length > 0) {
    return existingPrs[0];
  }

  const prToCreate: GitPullRequest = {
    sourceRefName,
    targetRefName,
    title: `AB#${params.workItemId} - ${params.title}`,
    description: params.description,
  };

  const createdPr = await withRetry(() =>
    gitApi.createPullRequest(prToCreate, params.repositoryId, params.projectId)
  );

  if (createdPr.pullRequestId) {
    const artifactUrl = `vstfs:///Git/PullRequestId/${params.projectId}/${params.repositoryId}/${createdPr.pullRequestId}`;
    await adoClient.updateWorkItem(params.workItemId, [
      {
        op: Operation.Add,
        path: '/relations/-',
        value: {
          rel: 'ArtifactLink',
          url: artifactUrl,
          attributes: {
            name: 'Pull Request',
            comment: `Linked Pull Request #${createdPr.pullRequestId}`,
          },
        },
      },
    ]);
  }

  return createdPr;
}
// ponytail: basic branch PR creation; add reviewer pre-assignment in v2
