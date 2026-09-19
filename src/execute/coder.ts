import type { SimpleGit } from 'simple-git';

/**
 * Stages all changes and creates a conventional commit with an AB#<id> work item trailer.
 */
export async function commitImplementation(
  git: SimpleGit,
  workItemId: number,
  type: 'feat' | 'fix',
  message: string
): Promise<string> {
  const commitMessage = `${type}(#${workItemId}): ${message}\n\nAB#${workItemId}`;
  await git.add('.');
  const commitResult = await git.commit(commitMessage);
  return commitResult.commit;
}
