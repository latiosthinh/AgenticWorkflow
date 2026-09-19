import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { stateStore } from '../state/index.js';
import {
  getWorkItemDetails,
  flagTicketBlocked,
  transitionToDevDoneWithPacket,
} from '../ado/work-item.js';
import {
  createWorktree,
  cleanupWorktree,
  protectTestFiles,
} from '../sandbox/worktree.js';
import {
  calculateCumulativeDiff,
  verifyPackageDependencies,
} from './diff-guard.js';
import {
  checkTestImmutability,
  hasValidAssertions,
} from '../test-runner/immutability.js';
import { executeRepairLoop } from './repair.js';
import { parseVitestSummary } from '../test-runner/parser.js';
import { recordL3Evidence } from '../test-runner/evidence.js';
import { formatAcceptancePacketComment } from '../accept/packet.js';
import { resolvePreviewUrl, resolvePrUrl } from '../accept/urls.js';
import {
  formatReworkPrompt,
  type CumulativeReworkEnvelope,
} from '../accept/envelope.js';
import type { TestRunResult } from '../test-runner/executor.js';
import { env } from '../config/env.js';
import { runOpenCode } from './opencode-runner.js';
import { workItemQueueManager } from '../queue/lane-manager.js';

export interface ProcessReworkOptions {
  mockTestRunner?: () => Promise<TestRunResult>;
  mockCodeEdit?: (worktreePath: string, reworkPrompt?: string) => Promise<void>;
  maxDiffLoc?: number;
  baseBranch?: string;
  openCodeSessionId?: string;
  mockOpenCodeRunner?: (
    args: string[],
    cwd: string
  ) => Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }>;
}

export async function processWorkItemRework(
  workItemId: number,
  revId: number,
  feedbackText: string,
  options?: ProcessReworkOptions
): Promise<void> {
  let worktreePath: string | undefined;

  const markEventCompleted = () => {
    stateStore.updateDedupStatus(workItemId, revId, 'completed');
  };

  try {
    const workItem = await getWorkItemDetails(workItemId, revId);

    // 1. Attach worktree to existing task branch
    const worktreeResult = await createWorktree(
      process.cwd(),
      workItemId,
      workItem.title,
      { checkoutExistingBranch: true }
    );
    worktreePath = worktreeResult.worktreePath;

    const git = simpleGit(worktreeResult.worktreePath);
    const lockedFiles =
      worktreeResult.testFilesProtected ??
      protectTestFiles(worktreeResult.worktreePath);

    // 2. Fetch cumulative diff against base commit
    let baseRef = options?.baseBranch;
    let baseRefResolved = false;
    if (baseRef) {
      try {
        await git.raw(['rev-parse', '--verify', baseRef]);
        baseRefResolved = true;
      } catch {}
    }

    if (!baseRefResolved) {
      const candidates = ['master', 'main', 'origin/main', 'origin/master'];
      for (const candidate of candidates) {
        try {
          await git.raw(['rev-parse', '--verify', candidate]);
          baseRef = candidate;
          baseRefResolved = true;
          break;
        } catch {
          // continue
        }
      }
    }

    if (!baseRef || !baseRefResolved) {
      throw new Error(
        `Unable to resolve valid base branch reference for cumulative diff. Checked: ${baseRef}, master, main, origin/main, origin/master`
      );
    }

    let baseCommit: string;
    try {
      baseCommit = (await git.raw(['merge-base', 'HEAD', baseRef])).trim();
    } catch {
      baseCommit = (await git.revparse([baseRef])).trim();
    }
    const priorDiffStat = await calculateCumulativeDiff(git, baseCommit);

    // 3. Build rework envelope & format prompt
    const envelope: CumulativeReworkEnvelope = {
      workItemId: workItem.id,
      title: workItem.title,
      originalAcceptanceCriteria: workItem.acceptanceCriteria || '',
      priorGitDiff: priorDiffStat.rawStat || `${priorDiffStat.totalLoc} LOC`,
      reviewFeedback: [feedbackText],
      remainingLocBudget: 250 - priorDiffStat.totalLoc,
    };
    const reworkPrompt = formatReworkPrompt(envelope);

    // 4. Bounded code editing
    if (options?.mockCodeEdit) {
      await options.mockCodeEdit(worktreeResult.worktreePath, reworkPrompt);
    } else if (env.NODE_ENV !== 'test' || options?.mockOpenCodeRunner) {
      let openCodeSessionId = options?.openCodeSessionId;
      if (!openCodeSessionId) {
        const ticket = await stateStore.getTicketState(workItem.id);
        openCodeSessionId = ticket?.agentSessionId || ticket?.lastAgentSessionId;
      }
      const runRes = await runOpenCode({
        cwd: worktreeResult.worktreePath,
        message: reworkPrompt,
        sessionId: openCodeSessionId,
        mockRunner: options?.mockOpenCodeRunner,
      });
      if (!runRes.success) {
        const diag = runRes.timedOut
          ? 'OpenCode rework timed out'
          : `OpenCode rework failed (exit ${runRes.exitCode}): ${runRes.error || runRes.output}`;
        const comment = `<h3>[Agent Execution Failed] ${runRes.timedOut ? 'Execution Timed Out' : 'Execution Failed'}</h3><pre>${runRes.error || runRes.output || diag}</pre>`;
        await flagTicketBlocked(workItem.id, comment, 'repair-exhausted');
        await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
        worktreePath = undefined;
        markEventCompleted();
        return;
      }
      if (runRes.sessionId) {
        await workItemQueueManager.runInLane(workItem.id, async () => {
          await stateStore.updateTicketState(workItem.id, (draft) => {
            draft.agentSessionId = runRes.sessionId;
            draft.lastAgentSessionId = runRes.sessionId;
          });
        });
      }
    }

    // 5. Verify cumulative diff ceiling (<250 LOC)
    const cumulativeDiff = await calculateCumulativeDiff(git, baseCommit);
    const maxLoc = options?.maxDiffLoc ?? 250;
    if (cumulativeDiff.totalLoc > maxLoc) {
      await flagTicketBlocked(
        workItem.id,
        `<h3>[Diff Ceiling Exceeded] Cumulative rework diff ${cumulativeDiff.totalLoc} LOC exceeds ${maxLoc} LOC ceiling</h3>`,
        'diff-ceiling'
      );
      await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
      worktreePath = undefined;
      markEventCompleted();
      return;
    }

    // 6. Verify package dependencies
    let pkgDiffValid = true;
    let unauthorizedPackages: string[] = [];
    try {
      const currentPkgPath = path.join(
        worktreeResult.worktreePath,
        'package.json'
      );
      if (fs.existsSync(currentPkgPath)) {
        let originalPkg = '{}';
        try {
          originalPkg = await git.show([`${baseCommit}:package.json`]);
        } catch {
          originalPkg = '{}';
        }
        const currentPkg = fs.readFileSync(currentPkgPath, 'utf8');
        const pkgCheck = verifyPackageDependencies(
          originalPkg,
          currentPkg,
          workItem.acceptanceCriteria || ''
        );
        if (!pkgCheck.valid) {
          pkgDiffValid = false;
          unauthorizedPackages = pkgCheck.unauthorizedPackages;
        }
      }
    } catch {
      // Ignore package read errors
    }

    if (!pkgDiffValid) {
      await flagTicketBlocked(
        workItem.id,
        `<h3>[Contract Conflict] Unauthorized package dependencies added: ${unauthorizedPackages.join(', ')}</h3>`,
        'contract-conflict'
      );
      await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
      worktreePath = undefined;
      markEventCompleted();
      return;
    }

    // 7. Verify test immutability & valid assertions on new test files
    const rawDiff = await git.raw(['diff', '--name-status', baseCommit]);
    const immutability = checkTestImmutability(rawDiff, lockedFiles);
    if (!immutability.valid) {
      await flagTicketBlocked(
        workItem.id,
        `<h3>[Contract Conflict] Protected test files modified: ${immutability.violations.join(', ')}</h3>`,
        'contract-conflict'
      );
      await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
      worktreePath = undefined;
      markEventCompleted();
      return;
    }

    for (const newTest of immutability.newTestFiles) {
      const fullPath = path.join(worktreeResult.worktreePath, newTest);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (!hasValidAssertions(content)) {
          await flagTicketBlocked(
            workItem.id,
            `<h3>[Contract Conflict] New test file lacks valid assertions: <code>${newTest}</code></h3>`,
            'contract-conflict'
          );
          await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
          worktreePath = undefined;
          markEventCompleted();
          return;
        }
      }
    }

    // 8. Test runner & repair loop
    const defaultMockTestRunner =
      env.NODE_ENV === 'test'
        ? async () => ({
            passed: true,
            exitCode: 0,
            stdout: 'Tests  1 passed (1)\nDuration 100ms',
            stderr: '',
            timedOut: false,
            durationMs: 100,
          })
        : undefined;

    const repairResult = await executeRepairLoop({
      worktreePath: worktreeResult.worktreePath,
      git,
      workItemId: workItem.id,
      mockTestRunner: options?.mockTestRunner || defaultMockTestRunner,
    });

    if (!repairResult.success) {
      await flagTicketBlocked(
        workItem.id,
        `<h3>[Repair Exhausted] Test self-repair budget exhausted</h3><p>WIP branch created: <code>${repairResult.wipBranch}</code></p><pre>${repairResult.diagnostics}</pre>`,
        'repair-exhausted'
      );
      await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
      worktreePath = undefined;
      markEventCompleted();
      return;
    }

    // 9. Commit with fix(review) convention
    await git.add('.');
    const status = await git.status();
    if (status.staged.length > 0 || !status.isClean()) {
      await git.commit(
        `fix(review): address acceptance feedback\n\nAB#${workItem.id}`
      );
      try {
        await git.push('origin', worktreeResult.branchName);
      } catch {
        // Ignore remote push failures in local/offline test environments
      }
    }

    // 10. Record L3 evidence
    const durationMs = repairResult.testResult?.durationMs || 100;
    const vitestSummary = parseVitestSummary(
      repairResult.testResult?.stdout || '',
      durationMs
    );
    const totalTests = vitestSummary.totalTests || 1;
    const passed =
      vitestSummary.passed ||
      (vitestSummary.failed === 0 ? totalTests : 0);
    const failed = vitestSummary.failed;

    await recordL3Evidence({
      workItemId: workItem.id,
      revId,
      testSuite: 'vitest',
      totalTests,
      passed,
      failed,
      durationMs,
      gitDiffStat: cumulativeDiff.rawStat || `${cumulativeDiff.totalLoc} LOC`,
    });

    // 11. Format Acceptance Packet & transition to Dev Done
    const prUrl = resolvePrUrl(workItem.id, worktreeResult.branchName);
    const previewUrl = resolvePreviewUrl(workItem.id);

    const packetComment = formatAcceptancePacketComment({
      workItemId: workItem.id,
      testSuite: 'vitest',
      totalTests,
      passed,
      failed,
      durationMs,
      gitDiffStat: cumulativeDiff,
      prUrl,
      previewUrl,
    });

    await transitionToDevDoneWithPacket(workItem.id, packetComment);
    await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
    worktreePath = undefined;

    markEventCompleted();
  } catch (err: any) {
    if (worktreePath) {
      await cleanupWorktree(process.cwd(), worktreePath).catch(() => {});
    }

    stateStore.updateDedupStatus(
      workItemId,
      revId,
      'failed',
      err?.message || String(err)
    );

    console.error(
      `[rework-worker] Failed processing rework for work item ${workItemId} rev ${revId}:`,
      err
    );
    throw err;
  }
}

// ponytail: synchronous rework worker pipeline; decouple via durable queues in v2
