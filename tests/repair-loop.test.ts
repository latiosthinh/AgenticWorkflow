import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { executeRepairLoop } from '../src/execute/repair.js';
import type { RepairLoopResult } from '../src/execute/repair.js';
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

describe('Opencode-Driven Repair Loop', () => {
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

  it('Test 1: repair invokes runOpenCode with failure diagnostics, second test passes → success with repairAttempted:true, filesEdited>0', async () => {
    const git = simpleGit(tempRepo);
    let testAttempts = 0;
    let opencodeCalls = 0;
    let capturedMessage = '';

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 201,
      maxCycles: 3,
      mockTestRunner: async () => {
        testAttempts++;
        if (testAttempts === 1) {
          return {
            passed: false, exitCode: 1,
            stdout: 'FAIL tests/app.test.ts\nAssertionError: expected true to be false\n  at src/app.ts:12:5',
            stderr: '', timedOut: false, durationMs: 40,
          };
        }
        return { passed: true, exitCode: 0, stdout: 'PASS', stderr: '', timedOut: false, durationMs: 30 };
      },
      mockOpenCodeRunner: async (args, cwd) => {
        opencodeCalls++;
        capturedMessage = args[args.length - 1]; // message is last arg
        // Simulate opencode writing a fix file
        fs.writeFileSync(path.join(cwd, 'fix.ts'), 'export const fixed = true;\n');
        await simpleGit(cwd).add('fix.ts');
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });

    expect(result.success).toBe(true);
    expect(result.cyclesUsed).toBe(1);
    expect(result.repairAttempted).toBe(true);
    expect(result.filesEdited).toBeGreaterThan(0);
    expect(opencodeCalls).toBe(1);
    expect(capturedMessage).toContain('tests failed');
    expect(capturedMessage).toContain('AssertionError');
    expect(testAttempts).toBe(2);
  });

  it('Test 2: opencode runs but makes no edits (git diff empty) → repairAttempted:true, filesEdited:0, continues', async () => {
    const git = simpleGit(tempRepo);
    let testAttempts = 0;
    let opencodeCalls = 0;

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 202,
      maxCycles: 2,
      mockTestRunner: async () => {
        testAttempts++;
        return {
          passed: false, exitCode: 1,
          stdout: 'FAIL tests/foo.test.ts\nAssertionError: nope',
          stderr: '', timedOut: false, durationMs: 30,
        };
      },
      mockOpenCodeRunner: async () => {
        opencodeCalls++;
        // Simulate opencode running but making no edits
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });

    expect(result.success).toBe(false);
    expect(result.repairAttempted).toBe(true);
    expect(result.filesEdited).toBe(0);
    expect(opencodeCalls).toBe(1); // only 1 repair cycle (maxCycles=2: test1 fail, repair, test2 fail, budget)
  });

  it('Test 3: all cycles exhausted → success:false, WIP branch created, repairAttempted:true', async () => {
    const git = simpleGit(tempRepo);
    let opencodeCalls = 0;

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 203,
      maxCycles: 3,
      mockTestRunner: async () => ({
        passed: false, exitCode: 1,
        stdout: 'FAIL tests/math.test.ts\nAssertionError: expected 4 to be 5\n  at src/math.ts:10:3',
        stderr: '', timedOut: false, durationMs: 40,
      }),
      mockOpenCodeRunner: async (_args, cwd) => {
        opencodeCalls++;
        // Simulate opencode writing a file each cycle (but tests keep failing)
        fs.writeFileSync(path.join(cwd, `attempt-${opencodeCalls}.ts`), `// attempt ${opencodeCalls}\n`);
        await simpleGit(cwd).add(`attempt-${opencodeCalls}.ts`);
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });

    expect(result.success).toBe(false);
    expect(result.cyclesUsed).toBe(3);
    expect(result.repairAttempted).toBe(true);
    expect(result.filesEdited).toBeGreaterThan(0);
    expect(result.wipBranch).toBe('wip/ticket-203');
    expect(result.diagnostics).toContain('tests failed');
    expect(opencodeCalls).toBe(2); // 3 test runs, 2 repair attempts (no repair after last test)

    // Verify WIP branch created
    const branches = await git.branchLocal();
    expect(branches.current).toBe('wip/ticket-203');
  });

  it('Test 4: first test passes → no repair invoked → repairAttempted:false, cyclesUsed:0', async () => {
    const git = simpleGit(tempRepo);
    let opencodeCalls = 0;

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 204,
      mockTestRunner: async () => ({
        passed: true, exitCode: 0,
        stdout: 'Tests passed', stderr: '', timedOut: false, durationMs: 50,
      }),
      mockOpenCodeRunner: async () => {
        opencodeCalls++;
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });

    expect(result.success).toBe(true);
    expect(result.cyclesUsed).toBe(0);
    expect(result.repairAttempted).toBe(false);
    expect(result.filesEdited).toBe(0);
    expect(opencodeCalls).toBe(0);
  });

  it('Test 5: maxCycles clamped between 1 and 5', async () => {
    const git = simpleGit(tempRepo);
    let attempts: number;

    // maxCycles=0 → clamped to 1
    attempts = 0;
    await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 3001,
      maxCycles: 0,
      mockTestRunner: async () => {
        attempts++;
        return { passed: false, exitCode: 1, stdout: 'FAIL', stderr: '', timedOut: false, durationMs: 10 };
      },
      mockOpenCodeRunner: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }),
    });
    expect(attempts).toBe(1);

    // maxCycles=10 → clamped to 5
    attempts = 0;
    await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 3002,
      maxCycles: 10,
      mockTestRunner: async () => {
        attempts++;
        return { passed: false, exitCode: 1, stdout: 'FAIL', stderr: '', timedOut: false, durationMs: 10 };
      },
      mockOpenCodeRunner: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }),
    });
    expect(attempts).toBe(5);
  });

  it('preserves uncommitted progress on wip/ticket-{id} branch with work item trailer on budget exhaustion', async () => {
    const git = simpleGit(tempRepo);

    fs.writeFileSync(path.join(tempRepo, 'wip-feature.ts'), 'export const wip = true;\n');

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 2048,
      maxCycles: 3,
      mockTestRunner: async () => ({
        passed: false, exitCode: 1,
        stdout: 'FAIL tests/math.test.ts\nAssertionError: expected 4 to be 5\n  at src/math.ts:10:3',
        stderr: '', timedOut: false, durationMs: 40,
      }),
      mockOpenCodeRunner: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }),
    });

    expect(result.success).toBe(false);
    expect(result.cyclesUsed).toBe(3);
    expect(result.wipBranch).toBe('wip/ticket-2048');
    expect(result.repairAttempted).toBe(true);

    const branches = await git.branchLocal();
    expect(branches.current).toBe('wip/ticket-2048');

    const log = await git.log({ maxCount: 1 });
    expect(log.latest?.message).toContain('wip: repair budget exhausted for ticket 2048');
    expect(log.latest?.body).toContain('AB#2048');

    expect(result.diagnostics).toContain('1 tests failed');
    expect(result.diagnostics).toContain('AssertionError: expected 4 to be 5');
  });

  it('does not double count files across repair cycles and includes untracked files', async () => {
    const git = simpleGit(tempRepo);
    let opencodeCalls = 0;

    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 205,
      maxCycles: 3,
      mockTestRunner: async () => ({
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/math.test.ts',
        stderr: '',
        timedOut: false,
        durationMs: 20,
      }),
      mockOpenCodeRunner: async (_args, cwd) => {
        opencodeCalls++;
        if (opencodeCalls === 1) {
          fs.appendFileSync(path.join(cwd, 'README.md'), 'updated line\n');
          fs.writeFileSync(path.join(cwd, 'untracked.ts'), 'export const a = 1;\n');
        } else if (opencodeCalls === 2) {
          fs.appendFileSync(path.join(cwd, 'README.md'), 'another line\n');
        }
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });

    expect(result.success).toBe(false);
    expect(opencodeCalls).toBe(2);
    expect(result.filesEdited).toBe(2);
  });
});
