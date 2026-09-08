import { simpleGit, type SimpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, slugify } from '../utils/paths.js';
import type { WorktreeResult } from './types.js';

// ponytail: local worktree isolation; add remote container pool for multi-tenant cloud runners in v2

/**
 * Recursively scans directory for test assertion files and locks them with 0o444 permissions.
 * Skips node_modules, .git, and .worktrees directories.
 */
export function protectTestFiles(worktreePath: string): string[] {
  const protectedFiles: string[] = [];
  if (!fs.existsSync(worktreePath)) return protectedFiles;

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.worktrees') {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
          try {
            fs.chmodSync(fullPath, 0o444);
            protectedFiles.push(normalizePath(fullPath));
          } catch {
            // Ignore chmod errors if file is locked or OS-restricted
          }
        }
      }
    }
  };

  walk(worktreePath);
  return protectedFiles;
}

/**
 * Restores 0o666 write permissions to locked files to prevent Windows NTFS EPERM errors.
 */
export function unprotectFiles(filePaths: string[]): void {
  for (const file of filePaths) {
    try {
      if (fs.existsSync(file)) {
        fs.chmodSync(file, 0o666);
      }
    } catch {
      // Ignore errors during unlock
    }
  }
}

/**
 * Creates an isolated ephemeral git worktree for a ticket on a dedicated task branch.
 */
export async function createWorktree(
  repoRoot: string,
  workItemId: number,
  title: string,
  baseBranch = 'origin/main'
): Promise<WorktreeResult> {
  const git: SimpleGit = simpleGit(repoRoot);
  const slug = slugify(title);
  const dirName = `ticket-${workItemId}-${slug}`;
  const worktreeDir = path.join(repoRoot, '.worktrees');
  const worktreePath = normalizePath(path.join(worktreeDir, dirName));
  const branchName = `task/ticket-${workItemId}-${slug}`;

  // Prune dangling worktrees first
  try {
    await git.raw(['worktree', 'prune']);
  } catch {
    // Ignore prune errors on fresh repo
  }

  // Ensure .worktrees directory exists
  if (!fs.existsSync(worktreeDir)) {
    fs.mkdirSync(worktreeDir, { recursive: true });
  }

  // If worktree path already exists from previous run, clean it up first
  if (fs.existsSync(worktreePath)) {
    await cleanupWorktree(repoRoot, worktreePath, { deleteBranch: true, branchName });
  }

  // If local branch already exists, remove it cleanly first
  try {
    const branchSummary = await git.branchLocal();
    if (branchSummary.all.includes(branchName)) {
      await git.raw(['branch', '-D', branchName]);
    }
  } catch {
    // Ignore branch deletion errors
  }

  // Fallback to HEAD if baseBranch cannot be resolved
  let targetBase = baseBranch;
  try {
    await git.raw(['rev-parse', '--verify', baseBranch]);
  } catch {
    targetBase = 'HEAD';
  }

  // Add git worktree
  await git.raw(['worktree', 'add', '-b', branchName, worktreePath, targetBase]);

  // Recursively protect test files
  const testFilesProtected = protectTestFiles(worktreePath);

  return {
    worktreePath,
    branchName,
    testFilesProtected,
  };
}

/**
 * Tears down ephemeral git worktree, unprotecting read-only files before deletion.
 */
export async function cleanupWorktree(
  repoRoot: string,
  worktreePath: string,
  options?: { deleteBranch?: boolean; branchName?: string }
): Promise<void> {
  const normalizedWorktreePath = normalizePath(worktreePath);

  if (fs.existsSync(normalizedWorktreePath)) {
    const unlockAll = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === '.git') continue;
            unlockAll(fullPath);
          } else {
            try {
              fs.chmodSync(fullPath, 0o666);
            } catch {
              // Ignore unlock error on specific file
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    };
    unlockAll(normalizedWorktreePath);
  }

  const git: SimpleGit = simpleGit(repoRoot);
  try {
    await git.raw(['worktree', 'remove', '--force', normalizedWorktreePath]);
  } catch {
    // Fallback: manually delete worktree directory if git remove fails
    if (fs.existsSync(normalizedWorktreePath)) {
      try {
        fs.rmSync(normalizedWorktreePath, { recursive: true, force: true });
      } catch {
        // Ignore removal error
      }
    }
  }

  try {
    await git.raw(['worktree', 'prune']);
  } catch {
    // Ignore prune errors
  }

  if (options?.deleteBranch && options.branchName) {
    try {
      await git.raw(['branch', '-D', options.branchName]);
    } catch {
      // Ignore branch deletion failure
    }
  }
}

/**
 * Prunes orphaned worktrees in .worktrees directory that have not been modified for maxAgeMs (default 2 hours).
 */
export async function pruneOrphanedWorktrees(
  repoRoot: string,
  maxAgeMs = 2 * 60 * 60 * 1000
): Promise<number> {
  const worktreesDir = path.join(repoRoot, '.worktrees');
  if (!fs.existsSync(worktreesDir)) {
    return 0;
  }

  let prunedCount = 0;
  const now = Date.now();
  const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = normalizePath(path.join(worktreesDir, entry.name));
    try {
      const stat = fs.statSync(dirPath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await cleanupWorktree(repoRoot, dirPath);
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
        prunedCount++;
      }
    } catch {
      // Ignore individual directory pruning failures
    }
  }

  return prunedCount;
}
