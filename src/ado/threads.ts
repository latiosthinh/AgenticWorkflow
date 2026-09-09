import {
  CommentThreadStatus,
  type GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { adoClient, withRetry } from './client.js';

export interface InlineReviewComment {
  filePath: string;
  lineNumber?: number;
  author: string;
  content: string;
}

export async function extractActiveReviewComments(
  repositoryId: string,
  pullRequestId: number,
  projectId: string,
  botId?: string
): Promise<InlineReviewComment[]> {
  const gitApi = await adoClient.getGitApi();
  const threads: GitPullRequestCommentThread[] = await withRetry(() =>
    gitApi.getThreads(repositoryId, pullRequestId, projectId)
  );

  const activeComments: InlineReviewComment[] = [];

  for (const thread of threads || []) {
    if (
      thread.isDeleted ||
      thread.status === CommentThreadStatus.Fixed ||
      thread.status === CommentThreadStatus.Closed ||
      thread.status === CommentThreadStatus.ByDesign
    ) {
      continue;
    }

    const filePath = thread.threadContext?.filePath || 'General Comment';
    const lineNumber =
      thread.threadContext?.rightFileStart?.line ??
      thread.threadContext?.leftFileStart?.line;

    for (const comment of thread.comments || []) {
      if (comment.isDeleted) {
        continue;
      }

      const authorId = comment.author?.id;
      if (botId && authorId && authorId.toLowerCase() === botId.toLowerCase()) {
        continue;
      }

      const content = comment.content?.trim() || '';
      if (content.includes('<!-- [automated-agent] -->')) {
        continue;
      }

      activeComments.push({
        filePath,
        lineNumber,
        author: comment.author?.displayName || 'Reviewer',
        content,
      });
    }
  }

  return activeComments;
}
// ponytail: flat thread comment extraction; add reply chain hierarchy in v2
