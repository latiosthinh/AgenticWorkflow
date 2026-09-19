import { stateStore } from '../state/index.js';
import { workItemQueueManager, laneContext } from '../queue/lane-manager.js';
import { adoClient } from '../ado/client.js';
import { getWorkItemDetails, buildTagPatch, flagTicketBlocked } from '../ado/work-item.js';
import { createWorktree, cleanupWorktree } from '../sandbox/worktree.js';
import { simpleGit } from 'simple-git';
import { slugify } from '../utils/paths.js';
import { formatWorkerAlertComment } from '../ado/formatter.js';
import {
  checkStagingHealth,
  executeTwoStrikeQaFilter,
  type QaRunResult,
  type TwoStrikeResult,
} from './runner.js';
import {
  evaluateQaCircuitBreaker,
  recordQaBounce,
  resetQaBounces,
  escalateQaToBlocked,
  MAX_QA_BOUNCES,
} from './breaker.js';
import {
  formatQaEvidenceComment,
  formatQaDiagnosticsComment,
} from './formatter.js';
import {
  processWorkItemRework,
  type ProcessReworkOptions,
} from '../execute/rework-worker.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export interface ProcessQaOptions {
  testCommand?: string;
  stagingUrl?: string;
  mockRunner?: (runIndex: number) => Promise<QaRunResult>;
  autoRetriggerRework?: boolean;
  reworkOptions?: ProcessReworkOptions;
}

export async function processQaVerification(
  workItemId: number,
  options?: ProcessQaOptions
): Promise<TwoStrikeResult | void> {
  const workItem = await getWorkItemDetails(workItemId);

  const isQaFlow =
    workItem.boardColumn?.toLowerCase() === 'ready for qa' ||
    workItem.boardColumn?.toLowerCase() === 'in qa' ||
    workItem.state.toLowerCase() === 'ready for qa';

  if (!isQaFlow) {
    return;
  }

  // Preflight staging health check
  const health = await checkStagingHealth(options?.stagingUrl);
  if (!health.healthy) {
    console.warn(
      `[qa-worker] Staging health pre-flight check failed: ${health.error}. Proceeding with caution.`
    );
  }

  // Provision isolated worktree on task branch or target
  let worktreePath: string | undefined;
  let commitSha: string | undefined;

  try {
    const worktreeResult = await createWorktree(
      process.cwd(),
      workItemId,
      workItem.title || 'qa-verification',
      { checkoutExistingBranch: true }
    );
    worktreePath = worktreeResult.worktreePath;
  } catch (err) {
    console.warn(`[qa-worker] Failed to attach to task branch; using process.cwd() fallback:`, err);
    worktreePath = process.cwd();
  }

  if (worktreePath) {
    try {
      const git = simpleGit(worktreePath);
      commitSha = (await git.raw(['rev-parse', 'HEAD'])).trim();
    } catch (err) {
      console.warn(`[qa-worker] Failed rev-parse HEAD in worktree (${worktreePath}):`, err);
    }
  }

  if (!commitSha) {
    try {
      const rootGit = simpleGit(process.cwd());
      const slug = slugify(workItem.title || 'qa-verification');
      const branchRef = `task/ticket-${workItemId}-${slug}`;
      commitSha = (await rootGit.raw(['rev-parse', branchRef])).trim();
    } catch (err) {
      console.warn(`[qa-worker] Failed resolving branch ref:`, err);
    }
  }

  if (!commitSha) {
    console.error(`[qa-worker] Could not resolve commit SHA for work item #${workItemId}`);
    if (worktreePath && worktreePath !== process.cwd()) {
      await cleanupWorktree(process.cwd(), worktreePath).catch(() => {});
    }
    const alertComment = formatWorkerAlertComment(
      '[QA Harness Error] Git Commit SHA Unresolved',
      `Failed to resolve real commit SHA for work item #${workItemId}. Fail-closed: hardcoded 'main' is prohibited.`
    );
    await flagTicketBlocked(workItemId, alertComment, 'qa-harness-error');
    return;
  }

  let result: TwoStrikeResult;
  try {
    result = await executeTwoStrikeQaFilter({
      workItemId,
      commitSha,
      worktreePath,
      testCommand: options?.testCommand,
      runnerFn: options?.mockRunner,
    });
  } finally {
    if (worktreePath && worktreePath !== process.cwd()) {
      await cleanupWorktree(process.cwd(), worktreePath);
    }
  }

  if (result.outcome === 'passed' || result.outcome === 'flaked') {
    // QA PASS
    const totalTests = result.firstRun.parsedSummary.totalTests;
    const passedCount = result.flakeCleared
      ? result.secondRun!.parsedSummary.passed
      : result.firstRun.parsedSummary.passed;
    const durationMs =
      result.firstRun.durationMs + (result.secondRun?.durationMs || 0);

    const mutate = async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.qaEvidence = {
          totalTests,
          passedCount,
          failedCount: 0,
          durationMs,
          commitSha,
          stagingUrl: options?.stagingUrl ?? null,
          flakeCleared: result.flakeCleared ? 1 : 0,
          createdAt: new Date().toISOString(),
        };
      });
    };

    if (laneContext.getStore()?.workItemId === workItemId) {
      await mutate();
    } else {
      await workItemQueueManager.runInLane(workItemId, mutate);
    }

    await resetQaBounces(workItemId);

    const evidenceComment = formatQaEvidenceComment({
      totalTests,
      passedCount,
      failedCount: 0,
      durationMs,
      commitSha,
      stagingUrl: options?.stagingUrl,
      flakeCleared: result.flakeCleared,
    });

    const tagPatch = buildTagPatch(workItem.tags, '[qa-verified]', '[qa-failed]');
    const patch: JsonPatchDocument = [
      {
        op: Operation.Replace,
        path: '/fields/System.State',
        value: 'Ready to Deploy',
      },
      ...tagPatch,
      {
        op: Operation.Add,
        path: '/fields/System.History',
        value: evidenceComment,
      },
    ];

    await adoClient.updateWorkItem(workItemId, patch);
    return result;
  }

  // QA FAILED
  const breaker = await evaluateQaCircuitBreaker(workItemId);

  if (breaker.allowed) {
    const currentBounce = await recordQaBounce(workItemId);

    const failures = result.secondRun?.failures || result.firstRun.failures;
    const stdoutTail = result.secondRun?.stdout || result.firstRun.stdout;
    const stderrTail = result.secondRun?.stderr || result.firstRun.stderr;

    const diagnosticsComment = formatQaDiagnosticsComment({
      workItemId,
      commitSha,
      failures,
      stdoutTail,
      stderrTail,
      currentBounce,
      maxBounces: MAX_QA_BOUNCES,
    });

    const tagPatch = buildTagPatch(workItem.tags, '[qa-failed]', '[qa-verified]');
    const patch: JsonPatchDocument = [
      {
        op: Operation.Replace,
        path: '/fields/System.State',
        value: 'In Dev',
      },
      ...tagPatch,
      {
        op: Operation.Add,
        path: '/fields/System.History',
        value: diagnosticsComment,
      },
    ];

    await adoClient.updateWorkItem(workItemId, patch);

    if (options?.autoRetriggerRework !== false) {
      const formattedFailures = failures
        .map((f) => `- ${f.testFile} > ${f.testName}: ${f.normalizedError}`)
        .join('\n');
      const feedback = `<qa_failure_diagnostic>\nWork item failed QA integration tests on commit ${commitSha}.\nReproduction command: npm run test:integration\nFailures:\n${formattedFailures}\n</qa_failure_diagnostic>`;

      try {
        await processWorkItemRework(
          workItemId,
          workItem.rev,
          feedback,
          options?.reworkOptions
        );
      } catch (reworkErr) {
        console.error(`[qa-worker] Failed to dispatch rework agent for #${workItemId}:`, reworkErr);
      }
    }

    return result;
  }

  // Circuit breaker tripped! Escalate to Blocked
  await escalateQaToBlocked(workItemId, breaker.currentCount);
  return result;
}
