import { SimpleGit } from 'simple-git';
import { runLocalTests, type TestRunResult } from '../test-runner/executor.js';
import { pruneTestDiagnostics } from '../test-runner/parser.js';
import { runOpenCode, type OpenCodeRunOptions } from './opencode-runner.js';

export interface RepairLoopOptions {
  worktreePath: string;
  git: SimpleGit;
  workItemId: number;
  maxCycles?: number;
  knownSecrets?: string[];
  mockTestRunner?: () => Promise<TestRunResult>;
  // Opencode repair delegation
  mockOpenCodeRunner?: OpenCodeRunOptions['mockRunner'];
  sessionId?: string;
}

export interface RepairLoopResult {
  success: boolean;
  cyclesUsed: number;
  wipBranch?: string;
  diagnostics?: string;
  testResult?: TestRunResult;
  // Honest evidence fields
  repairAttempted: boolean;
  filesEdited: number;
}

export async function executeRepairLoop(options: RepairLoopOptions): Promise<RepairLoopResult> {
  const maxCycles = Math.min(Math.max(options.maxCycles ?? 3, 1), 5);
  let cycle = 0;
  let lastTestResult: TestRunResult | undefined;
  let repairAttempted = false;
  let totalFilesEdited = 0;

  while (cycle < maxCycles) {
    const testResult = options.mockTestRunner
      ? await options.mockTestRunner()
      : await runLocalTests(
          options.worktreePath,
          'npm',
          ['test'],
          options.knownSecrets
        );

    lastTestResult = testResult;

    if (testResult.passed) {
      return { success: true, cyclesUsed: cycle, testResult, repairAttempted, filesEdited: totalFilesEdited };
    }

    cycle++;
    if (cycle >= maxCycles) {
      break;
    }

    // Prune diagnostics from failed test output
    const diagnostics = pruneTestDiagnostics(testResult.stdout, testResult.stderr);

    // Build repair prompt with failure context
    const repairPrompt = [
      'The following tests failed. Fix the code to make them pass.',
      '',
      diagnostics.summary,
      '',
      ...diagnostics.assertionErrors,
      '',
      ...diagnostics.prunedStackTrace,
    ].join('\n');

    // Re-invoke opencode with failure context
    repairAttempted = true;
    await runOpenCode({
      cwd: options.worktreePath,
      message: repairPrompt,
      mockRunner: options.mockOpenCodeRunner,
      sessionId: options.sessionId,
    });

    // Check git diff to count files edited (staged + unstaged vs HEAD)
    const diffStat = await options.git.diff(['--stat', 'HEAD']);
    const diffLines = diffStat.trim().split('\n').filter(l => l.includes('|'));
    totalFilesEdited += diffLines.length;
  }

  // Budget exhausted: preserve work on WIP branch
  const wipBranch = `wip/ticket-${options.workItemId}`;
  try {
    await options.git.checkout(['-B', wipBranch]);
    await options.git.add('.');
    const status = await options.git.status();
    if (status.staged.length > 0 || !status.isClean()) {
      await options.git.commit(
        `wip: repair budget exhausted for ticket ${options.workItemId}\n\nAB#${options.workItemId}`
      );
    }
    try {
      await options.git.push('origin', wipBranch);
    } catch {
      // Ignore remote push failure if offline or in local test environment
    }
  } catch {
    // Ignore commit failure if working tree is clean or git fails
  }

  const pruned = pruneTestDiagnostics(
    lastTestResult?.stdout || '',
    lastTestResult?.stderr || ''
  );

  return {
    success: false,
    cyclesUsed: cycle,
    wipBranch,
    diagnostics: `${pruned.summary}\n${pruned.assertionErrors.join('\n')}\n${pruned.prunedStackTrace.join('\n')}`,
    testResult: lastTestResult,
    repairAttempted,
    filesEdited: totalFilesEdited,
  };
}
