import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { normalizePath, slugify } from '../src/utils/paths.js';
import {
  createWorktree,
  cleanupWorktree,
  protectTestFiles,
  unprotectFiles,
  pruneOrphanedWorktrees,
} from '../src/sandbox/worktree.js';

describe('paths utility', () => {
  it('normalizePath converts backslashes and strips redundant/trailing slashes', () => {
    expect(normalizePath('C:\\projects\\app\\')).toBe('C:/projects/app');
    expect(normalizePath('foo//bar///baz/')).toBe('foo/bar/baz');
    expect(normalizePath('/foo/bar/')).toBe('/foo/bar');
    expect(normalizePath('')).toBe('');
    expect(normalizePath('C:/')).toBe('C:/');
  });

  it('slugify converts titles to lowercase kebab slugs under 40 chars', () => {
    expect(slugify('Add User Authentication Endpoint')).toBe('add-user-authentication-endpoint');
    expect(slugify('Bug: Fix NullPointer in Payment (#456)!!')).toBe('bug-fix-nullpointer-in-payment-456');
    expect(slugify('---hello---world---')).toBe('hello-world');
    const long = 'a'.repeat(60);
    expect(slugify(long).length).toBe(40);
  });
});

describe('worktree lifecycle management', () => {
  let tempRepo: string;

  beforeEach(async () => {
    tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-test-repo-'));
    const git = simpleGit(tempRepo);
    await git.init();
    await git.addConfig('user.name', 'Worktree Tester');
    await git.addConfig('user.email', 'tester@example.com');

    // Create root files and a test file
    fs.writeFileSync(path.join(tempRepo, 'package.json'), '{"name": "test-repo"}\n');
    fs.mkdirSync(path.join(tempRepo, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRepo, 'tests', 'sample.test.ts'),
      'import { test } from "vitest";\ntest("sample", () => {});\n'
    );
    fs.writeFileSync(
      path.join(tempRepo, 'tests', 'uppercase.SPEC.JS'),
      'console.log("spec");\n'
    );

    await git.add('.');
    await git.commit('Initial test commit');
  });

  afterEach(async () => {
    if (fs.existsSync(tempRepo)) {
      // Unlock any potential read-only files before removing temp directory
      const unlockAll = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              unlockAll(full);
            } else {
              try { fs.chmodSync(full, 0o666); } catch {}
            }
          }
        } catch {}
      };
      unlockAll(tempRepo);
      try {
        fs.rmSync(tempRepo, { recursive: true, force: true });
      } catch {}
    }
  });

  it('provisions isolated worktree, creates branch, and locks test files as read-only', async () => {
    const result = await createWorktree(tempRepo, 101, 'User Auth Feature', 'HEAD');

    expect(result.branchName).toBe('task/ticket-101-user-auth-feature');
    expect(fs.existsSync(result.worktreePath)).toBe(true);
    expect(result.testFilesProtected.length).toBe(2);
    expect(result.testFilesProtected.some((f) => f.endsWith('sample.test.ts'))).toBe(true);
    expect(result.testFilesProtected.some((f) => f.endsWith('uppercase.SPEC.JS'))).toBe(true);

    const protectedFile = result.testFilesProtected[0];
    expect(protectedFile.endsWith('sample.test.ts')).toBe(true);

    // Assert that writing to protected test file throws permission error (EPERM on Windows / EACCES on POSIX)
    expect(() => {
      fs.writeFileSync(protectedFile, '// Malicious test modification');
    }).toThrow();

    // Verify unprotectFiles restores write permissions
    unprotectFiles(result.testFilesProtected);
    expect(() => {
      fs.writeFileSync(protectedFile, '// Legitimate unlocked write');
    }).not.toThrow();

    // Cleanup worktree and branch
    await cleanupWorktree(tempRepo, result.worktreePath, {
      deleteBranch: true,
      branchName: result.branchName,
    });
    expect(fs.existsSync(result.worktreePath)).toBe(false);
  });

  it('prunes orphaned worktrees older than maxAgeMs', async () => {
    const worktreesDir = path.join(tempRepo, '.worktrees');
    fs.mkdirSync(worktreesDir, { recursive: true });

    const staleDir = path.join(worktreesDir, 'ticket-999-stale-task');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, 'dummy.txt'), 'stale content');

    // Backdate mtime by 3 hours
    const threeHoursAgo = (Date.now() - 3 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(staleDir, threeHoursAgo, threeHoursAgo);

    const freshDir = path.join(worktreesDir, 'ticket-888-fresh-task');
    fs.mkdirSync(freshDir, { recursive: true });
    fs.writeFileSync(path.join(freshDir, 'dummy.txt'), 'fresh content');

    const prunedCount = await pruneOrphanedWorktrees(tempRepo, 2 * 60 * 60 * 1000);

    expect(prunedCount).toBe(1);
    expect(fs.existsSync(staleDir)).toBe(false);
    expect(fs.existsSync(freshDir)).toBe(true);
  });
});
