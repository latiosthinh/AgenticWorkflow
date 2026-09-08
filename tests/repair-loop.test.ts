import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { executeRepairLoop } from '../src/execute/repair.js';
import { runLocalTests } from '../src/test-runner/executor.js';
import { pruneTestDiagnostics, parseVitestSummary } from '../src/test-runner/parser.js';

describe('Test Runner Parser and Pruner', () => {
  it('parses Vitest stdout summary numbers correctly', () => {
    const stdout = `
      Tests  1 failed | 5 passed (6)
      Duration 1.25s
    `;
    const summary = parseVitestSummary(stdout, 1250);
    expect(summary.passed).toBe(5);
    expect(summary.failed).toBe(1);
    expect(summary.totalTests).toBe(6);
    expect(summary.durationMs).toBe(1250);
  });

  it('prunes diagnostics to failing tests, assertion errors, and max 15 non-internal frames', () => {
    const rawStdout = `
FAIL tests/example.test.ts > suite > test 1
AssertionError: expected true to be false
  at runTest (src/app.ts:12:5)
  at processTicksAndRejections (node:internal/process/task_queues:95:5)
  at runSuite (node_modules/vitest/dist/index.js:50:1)
  ${Array.from({ length: 25 }, (_, i) => `  at caller${i} (src/app.ts:${i + 1}:1)`).join('\n')}
    `;
    const diagnostics = pruneTestDiagnostics(rawStdout, '');

    expect(diagnostics.failingTests).toContain('FAIL tests/example.test.ts > suite > test 1');
    expect(diagnostics.assertionErrors[0]).toContain('AssertionError: expected true to be false');
    expect(diagnostics.prunedStackTrace.length).toBeLessThanOrEqual(15);
    expect(diagnostics.prunedStackTrace.some((f) => f.includes('node_modules'))).toBe(false);
    expect(diagnostics.prunedStackTrace.some((f) => f.includes('node:internal'))).toBe(false);
    expect(diagnostics.summary).toBe('1 tests failed');
  });
});

describe('Sandboxed Local Test Runner Executor', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-exec-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('runs command with runner and returns structured result', async () => {
    const result = await runLocalTests(
      tempDir,
      process.execPath,
      ['-e', 'console.log("runner pass"); process.exit(0);']
    );

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('runner pass');
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures failing test run exit code and stderr', async () => {
    const result = await runLocalTests(
      tempDir,
      process.execPath,
      ['-e', 'console.error("runner fail"); process.exit(1);']
    );

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim()).toBe('runner fail');
  });
});

describe('Iterative Self-Repair Loop with WIP Branch Preservation', () => {
  let tempRepo: string;

  beforeEach(async () => {
    tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-loop-test-'));
    const git = simpleGit(tempRepo);
    await git.init();
    await git.addConfig('user.name', 'Tester');
    await git.addConfig('user.email', 'tester@example.com');
    fs.writeFileSync(path.join(tempRepo, 'README.md'), '# Initial Repo\n');
    await git.add('.');
    await git.commit('Initial commit');
  });

  afterEach(() => {
    fs.rmSync(tempRepo, { recursive: true, force: true });
  });

  it('terminates immediately with success when initial test passes (cycle 0)', async () => {
    const git = simpleGit(tempRepo);
    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 101,
      mockTestRunner: async () => ({
        passed: true,
        exitCode: 0,
        stdout: 'Tests passed',
        stderr: '',
        timedOut: false,
        durationMs: 50,
      }),
    });

    expect(result.success).toBe(true);
    expect(result.cyclesUsed).toBe(0);
    expect(result.testResult?.passed).toBe(true);
  });

  it('succeeds on subsequent cycle when repair mock turns green', async () => {
    const git = simpleGit(tempRepo);
    let attempts = 0;

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 102,
      maxCycles: 3,
      mockTestRunner: async () => {
        attempts++;
        if (attempts === 1) {
          return {
            passed: false,
            exitCode: 1,
            stdout: 'FAIL test.ts\nAssertionError: fail',
            stderr: '',
            timedOut: false,
            durationMs: 40,
          };
        }
        return {
          passed: true,
          exitCode: 0,
          stdout: 'PASS test.ts',
          stderr: '',
          timedOut: false,
          durationMs: 40,
        };
      },
    });

    expect(result.success).toBe(true);
    expect(result.cyclesUsed).toBe(1);
    expect(attempts).toBe(2);
  });

  it('bounds execution to maxCycles and terminates on budget exhaustion', async () => {
    const git = simpleGit(tempRepo);
    let attempts = 0;

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 103,
      maxCycles: 2,
      mockTestRunner: async () => {
        attempts++;
        return {
          passed: false,
          exitCode: 1,
          stdout: 'FAIL tests/app.test.ts\nAssertionError: expected 1 to be 2\n  at src/app.ts:5:5',
          stderr: '',
          timedOut: false,
          durationMs: 50,
        };
      },
    });

    expect(result.success).toBe(false);
    expect(result.cyclesUsed).toBe(2);
    expect(attempts).toBe(2);
  });

  it('preserves uncommitted progress on wip/ticket-{id} branch with work item trailer on budget exhaustion', async () => {
    const git = simpleGit(tempRepo);

    // Create uncommitted file in repo
    fs.writeFileSync(path.join(tempRepo, 'wip-feature.ts'), 'export const wip = true;\n');

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 2048,
      maxCycles: 3,
      mockTestRunner: async () => ({
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/math.test.ts\nAssertionError: expected 4 to be 5\n  at src/math.ts:10:3',
        stderr: '',
        timedOut: false,
        durationMs: 40,
      }),
    });

    expect(result.success).toBe(false);
    expect(result.cyclesUsed).toBe(3);
    expect(result.wipBranch).toBe('wip/ticket-2048');

    // Verify git branch checked out
    const branches = await git.branchLocal();
    expect(branches.current).toBe('wip/ticket-2048');

    // Verify commit created with trailer
    const log = await git.log({ maxCount: 1 });
    expect(log.latest?.message).toContain('wip: repair budget exhausted for ticket 2048');
    expect(log.latest?.body).toContain('AB#2048');

    // Verify diagnostics returned
    expect(result.diagnostics).toContain('1 tests failed');
    expect(result.diagnostics).toContain('AssertionError: expected 4 to be 5');
    expect(result.diagnostics).toContain('at src/math.ts:10:3');
  });

  it('resets and checks out wip branch cleanly even when wip branch already exists', async () => {
    const git = simpleGit(tempRepo);

    // Pre-create wip branch with different commit
    await git.checkoutLocalBranch('wip/ticket-2049');
    fs.writeFileSync(path.join(tempRepo, 'old-wip.ts'), 'old content\n');
    await git.add('.');
    await git.commit('old wip commit');

    // Switch back to master
    await git.checkout('master');

    // Create uncommitted change on master
    fs.writeFileSync(path.join(tempRepo, 'new-wip.ts'), 'new uncommitted work\n');

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 2049,
      maxCycles: 1,
      mockTestRunner: async () => ({
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/app.test.ts\nAssertionError: failed',
        stderr: '',
        timedOut: false,
        durationMs: 30,
      }),
    });

    expect(result.success).toBe(false);
    expect(result.wipBranch).toBe('wip/ticket-2049');

    const branches = await git.branchLocal();
    expect(branches.current).toBe('wip/ticket-2049');

    const log = await git.log({ maxCount: 1 });
    expect(log.latest?.message).toContain('wip: repair budget exhausted for ticket 2049');
  });

  it('clamps maxCycles to minimum 1 and maximum 5', async () => {
    const git = simpleGit(tempRepo);
    let attempts = 0;

    // Test clamped to 1 when passed 0 or negative
    await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 3001,
      maxCycles: 0,
      mockTestRunner: async () => {
        attempts++;
        return {
          passed: false,
          exitCode: 1,
          stdout: 'FAIL test.ts',
          stderr: '',
          timedOut: false,
          durationMs: 10,
        };
      },
    });
    expect(attempts).toBe(1);

    // Test clamped to 5 when passed > 5
    attempts = 0;
    await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 3002,
      maxCycles: 10,
      mockTestRunner: async () => {
        attempts++;
        return {
          passed: false,
          exitCode: 1,
          stdout: 'FAIL test.ts',
          stderr: '',
          timedOut: false,
          durationMs: 10,
        };
      },
    });
    expect(attempts).toBe(5);
  });
});
