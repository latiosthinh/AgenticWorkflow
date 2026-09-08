import { runCommand } from '../sandbox/runner.js';
import type { CommandResult } from '../sandbox/types.js';

export interface TestRunResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export async function runLocalTests(
  worktreePath: string,
  testCommand = 'npm',
  testArgs = ['test'],
  knownSecrets: string[] = []
): Promise<TestRunResult> {
  const start = Date.now();
  const result: CommandResult = await runCommand(
    testCommand,
    testArgs,
    {
      cwd: worktreePath,
      timeoutMs: 120_000,
    },
    knownSecrets
  );

  return {
    passed: result.exitCode === 0 && !result.timedOut,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    durationMs: Date.now() - start,
  };
}
