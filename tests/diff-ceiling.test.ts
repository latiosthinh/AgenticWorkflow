import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import {
  calculateCumulativeDiff,
  assertDiffCeiling,
  verifyPackageDependencies,
} from '../src/execute/diff-guard.js';
import {
  commitImplementation,
} from '../src/execute/coder.js';

describe('Diff Ceiling and Dependency Guard', () => {
  let tempRepo: string;

  beforeEach(async () => {
    tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-guard-test-'));
    const git = simpleGit(tempRepo);
    await git.init();
    await git.addConfig('user.name', 'Tester');
    await git.addConfig('user.email', 'tester@example.com');
    fs.writeFileSync(path.join(tempRepo, 'index.ts'), 'console.log("init");\n');
    await git.add('.');
    await git.commit('Initial');
  });

  afterEach(() => {
    fs.rmSync(tempRepo, { recursive: true, force: true });
  });

  it('calculates cumulative diff and parses insertions and deletions correctly', async () => {
    const git = simpleGit(tempRepo);
    const baseCommit = (await git.revparse(['HEAD'])).trim();

    fs.writeFileSync(path.join(tempRepo, 'feature.ts'), 'export const a = 1;\nexport const b = 2;\n');
    const stat = await calculateCumulativeDiff(git, baseCommit);

    expect(stat.filesChanged).toBe(1);
    expect(stat.insertions).toBe(2);
    expect(stat.deletions).toBe(0);
    expect(stat.totalLoc).toBe(2);
    expect(stat.rawStat).toContain('1 file changed');
  });

  it('calculates cumulative diff across multiple commits and working tree edits', async () => {
    const git = simpleGit(tempRepo);
    const baseCommit = (await git.revparse(['HEAD'])).trim();

    fs.writeFileSync(path.join(tempRepo, 'file1.ts'), 'console.log("1");\nconsole.log("2");\n');
    await git.add('.');
    await git.commit('Add file1');

    fs.writeFileSync(path.join(tempRepo, 'file2.ts'), 'console.log("3");\n');
    await git.add('.');
    await git.commit('Add file2');

    const stat = await calculateCumulativeDiff(git, baseCommit);
    expect(stat.filesChanged).toBe(2);
    expect(stat.insertions).toBe(3);
    expect(stat.deletions).toBe(0);
    expect(stat.totalLoc).toBe(3);
  });

  it('allows diff when totalLoc is within ceiling limit', async () => {
    const git = simpleGit(tempRepo);
    const baseCommit = (await git.revparse(['HEAD'])).trim();

    fs.writeFileSync(path.join(tempRepo, 'small.ts'), 'const a = 1;\n');
    const stat = await assertDiffCeiling(git, baseCommit, 250);
    expect(stat.totalLoc).toBe(1);
  });

  it('rejects changes exceeding 250 LOC ceiling with descriptive error', async () => {
    const git = simpleGit(tempRepo);
    const baseCommit = (await git.revparse(['HEAD'])).trim();

    // Add 260 lines
    const bigFile = Array.from({ length: 260 }, (_, i) => `line ${i}`).join('\n') + '\n';
    fs.writeFileSync(path.join(tempRepo, 'big.ts'), bigFile);

    const stat = await calculateCumulativeDiff(git, baseCommit);
    expect(stat.totalLoc).toBe(260);

    await expect(assertDiffCeiling(git, baseCommit, 250)).rejects.toThrow(
      /Diff ceiling exceeded: 260 LOC changed \(ceiling is <250 LOC\)\. Aborting implementation\./
    );
  });

  it('guards package dependencies against unapproved additions', () => {
    const original = JSON.stringify({
      dependencies: { express: '^4.0.0' },
      devDependencies: { vitest: '^1.0.0' },
    });
    const updated = JSON.stringify({
      dependencies: { express: '^4.0.0', lodash: '^4.17.21', axios: '^1.6.0' },
      devDependencies: { vitest: '^1.0.0' },
    });

    // lodash and axios added, but only axios is mentioned in AC
    const result = verifyPackageDependencies(
      original,
      updated,
      'Add HTTP client with axios for user service'
    );
    expect(result.valid).toBe(false);
    expect(result.unauthorizedPackages).toContain('lodash');
    expect(result.unauthorizedPackages).not.toContain('axios');
  });

  it('rejects packages that match arbitrary English substrings in AC without boundary', () => {
    const original = JSON.stringify({
      dependencies: {},
    });
    const updated = JSON.stringify({
      dependencies: { auth: '^1.0.0', form: '^2.0.0' },
    });

    // AC contains "authenticate" and "perform", which contain "auth" and "form" as substrings
    const result = verifyPackageDependencies(
      original,
      updated,
      'We must authenticate the user and perform operations cleanly.'
    );
    expect(result.valid).toBe(false);
    expect(result.unauthorizedPackages).toContain('auth');
    expect(result.unauthorizedPackages).toContain('form');
  });

  it('permits added packages when listed in allowlist', () => {
    const original = JSON.stringify({
      dependencies: { express: '^4.0.0' },
    });
    const updated = JSON.stringify({
      dependencies: { express: '^4.0.0', pino: '^9.0.0' },
    });

    const result = verifyPackageDependencies(
      original,
      updated,
      'Refactor logging service',
      ['pino']
    );
    expect(result.valid).toBe(true);
    expect(result.unauthorizedPackages).toEqual([]);
  });

  it('handles invalid or empty package.json gracefully', () => {
    const result = verifyPackageDependencies('', '', 'No deps');
    expect(result.valid).toBe(true);
    expect(result.unauthorizedPackages).toEqual([]);
  });
});

describe('Conventional Commit', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coder-tools-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('commits implementation using conventional format and AB#<id> trailer', async () => {
    const git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'Coder');
    await git.addConfig('user.email', 'coder@example.com');

    fs.writeFileSync(path.join(tempDir, 'feature.ts'), 'console.log("feat");\n');

    const commitHash = await commitImplementation(
      git,
      4001,
      'feat',
      'add user profile endpoint'
    );

    expect(commitHash).toBeTruthy();

    const log = await git.log({ maxCount: 1 });
    const latestCommit = log.latest;
    expect(latestCommit?.message).toContain('feat(#4001): add user profile endpoint');
    expect(latestCommit?.body).toContain('AB#4001');
  });
});
