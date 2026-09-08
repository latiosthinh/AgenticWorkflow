import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import type { SimpleGit } from 'simple-git';
import { normalizePath } from '../utils/paths.js';

// ponytail: local filesystem coder tools; route to remote agent container sandbox in v2

function assertInsideWorktree(worktreePath: string, relativePath: string): string {
  const normalizedRel = normalizePath(relativePath);
  if (
    normalizedRel.startsWith('..') ||
    normalizedRel.includes('/../') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path traversal denied: ${relativePath}`);
  }

  const resolvedWorktree = path.resolve(worktreePath);
  const resolvedTarget = path.resolve(resolvedWorktree, relativePath);

  const normalizedWorktree = normalizePath(resolvedWorktree).toLowerCase();
  const normalizedTarget = normalizePath(resolvedTarget).toLowerCase();

  if (
    !normalizedTarget.startsWith(normalizedWorktree + '/') ||
    normalizedTarget === normalizedWorktree
  ) {
    throw new Error(`Path traversal denied: ${relativePath}`);
  }

  return resolvedTarget;
}

/**
 * Creates bounded file manipulation tools for an LLM coder targeting a specific worktree.
 */
export function createCoderTools(worktreePath: string) {
  return {
    createFile: tool({
      description: 'Create a new file with specified content in the worktree',
      parameters: z.object({
        relativePath: z.string().describe('Relative path inside worktree'),
        content: z.string().describe('UTF-8 file content'),
      }),
      execute: async ({ relativePath, content }) => {
        const fullPath = assertInsideWorktree(worktreePath, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
        return { success: true, path: normalizePath(relativePath) };
      },
    }),
    editFile: tool({
      description: 'Update content of an existing file in the worktree',
      parameters: z.object({
        relativePath: z.string().describe('Relative path inside worktree'),
        content: z.string().describe('New content to write'),
      }),
      execute: async ({ relativePath, content }) => {
        const fullPath = assertInsideWorktree(worktreePath, relativePath);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`File does not exist: ${relativePath}`);
        }
        fs.writeFileSync(fullPath, content, 'utf8');
        return { success: true, path: normalizePath(relativePath) };
      },
    }),
    deleteFile: tool({
      description: 'Delete a file in the worktree',
      parameters: z.object({
        relativePath: z.string().describe('Relative path inside worktree'),
      }),
      execute: async ({ relativePath }) => {
        const fullPath = assertInsideWorktree(worktreePath, relativePath);
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { force: true });
        }
        return { success: true, path: normalizePath(relativePath) };
      },
    }),
  };
}

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
