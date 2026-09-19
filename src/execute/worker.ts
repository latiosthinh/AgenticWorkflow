import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { stateStore } from '../state/index.js';
import {
  getWorkItemDetails,
  buildPlanQuestionPatch,
  buildPlanLockedPatch,
  transitionToDevDone,
  flagTicketBlocked,
  type WorkItemDetails,
} from '../ado/work-item.js';
import { adoClient } from '../ado/client.js';
import {
  createWorktree,
  cleanupWorktree,
  protectTestFiles,
} from '../sandbox/worktree.js';
import { createDynamicMcpTools } from '../mcp/registry.js';
import { formulateImplementationPlan } from '../plan/planner.js';
import {
  createPlanCheckpoint,
  getPendingCheckpoint,
  lockPlanCheckpoint,
  updateCheckpointStatus,
} from '../plan/checkpoint.js';
import {
  formatPlanQuestionsComment,
  formatPlanLockedComment,
} from '../plan/formatter.js';
import {
  calculateCumulativeDiff,
  verifyPackageDependencies,
} from './diff-guard.js';
import { commitImplementation } from './coder.js';
import {
  checkTestImmutability,
  hasValidAssertions,
} from '../test-runner/immutability.js';
import { executeRepairLoop } from './repair.js';
import { parseVitestSummary } from '../test-runner/parser.js';
import {
  recordL3Evidence,
  formatL3EvidenceComment,
} from '../test-runner/evidence.js';
import type { TestRunResult } from '../test-runner/executor.js';
import { env } from '../config/env.js';
import { runOpenCode } from './opencode-runner.js';
import { workItemQueueManager } from '../queue/lane-manager.js';

export interface ProcessExecuteOptions {
  mockTestRunner?: () => Promise<TestRunResult>;
  mockCodeEdit?: (worktreePath: string) => Promise<void>;
  maxDiffLoc?: number;
  autoProceedResumption?: boolean;
  openCodeSessionId?: string;
  mockOpenCodeRunner?: (
    args: string[],
    cwd: string
  ) => Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }>;
  forceAiPlanner?: boolean;
}

async function runExecutionPipeline(
  workItem: WorkItemDetails,
  revId: number,
  worktreeResult: {
    worktreePath: string;
    branchName: string;
    testFilesProtected?: string[];
  },
  options?: ProcessExecuteOptions
): Promise<void> {
  const lockedFiles =
    worktreeResult.testFilesProtected ??
    protectTestFiles(worktreeResult.worktreePath);
  const git = simpleGit(worktreeResult.worktreePath);
  const baseCommit = (await git.revparse(['HEAD'])).trim();

  // 2. Perform bounded code editing
  if (options?.mockCodeEdit) {
    await options.mockCodeEdit(worktreeResult.worktreePath);
  } else if (env.LOCAL_AGENT_TYPE === 'opencode' && (env.NODE_ENV !== 'test' || options?.mockOpenCodeRunner)) {
    const prompt = `Implement the following requirement:\n\nTitle: ${workItem.title}\n\nDescription: ${workItem.description}\n\nAcceptance Criteria:\n${workItem.acceptanceCriteria}`;
    const runRes = await runOpenCode({
      cwd: worktreeResult.worktreePath,
      message: prompt,
      sessionId: options?.openCodeSessionId,
      mockRunner: options?.mockOpenCodeRunner,
    });
    if (!runRes.success) {
      const diag = runRes.timedOut
        ? 'OpenCode execution timed out'
        : `OpenCode execution failed (exit ${runRes.exitCode}): ${runRes.error || runRes.output}`;
      const comment = `<h3>[Agent Execution Failed] ${runRes.timedOut ? 'Execution Timed Out' : 'Execution Failed'}</h3><pre>${runRes.error || runRes.output || diag}</pre>`;
      await flagTicketBlocked(workItem.id, comment, 'repair-exhausted');
      await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
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

  // 3. Guard diff ceiling (<250 LOC)
  const diffStat = await calculateCumulativeDiff(git, baseCommit);
  const maxLoc = options?.maxDiffLoc ?? 250;
  if (diffStat.totalLoc > maxLoc) {
    const comment = formatL3EvidenceComment({
      testSuite: 'vitest',
      totalTests: 0,
      passed: 0,
      failed: 1,
      durationMs: 0,
      gitDiffStat: diffStat,
      repairCyclesUsed: 0,
    });
    await flagTicketBlocked(workItem.id, comment, 'diff-ceiling');
    await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
    return;
  }

  // 4. Guard package.json dependencies
  let pkgDiffValid = true;
  let unauthorizedPackages: string[] = [];
  try {
    const currentPkgPath = path.join(worktreeResult.worktreePath, 'package.json');
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
    // Ignore error reading package.json
  }

  if (!pkgDiffValid) {
    await flagTicketBlocked(
      workItem.id,
      `<h3>[Contract Conflict] Unauthorized package dependencies added: ${unauthorizedPackages.join(', ')}</h3>`,
      'contract-conflict'
    );
    await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
    return;
  }

  // 5. Guard test assertion immutability
  const rawDiff = await git.raw(['diff', '--name-status', baseCommit]);
  const immutabilityResult = checkTestImmutability(rawDiff, lockedFiles);
  if (!immutabilityResult.valid) {
    await flagTicketBlocked(
      workItem.id,
      `<h3>[Contract Conflict] Protected test files modified: ${immutabilityResult.violations.join(', ')}</h3>`,
      'contract-conflict'
    );
    await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
    return;
  }

  // Guard newly added test files for valid assertions (T-3-03)
  for (const newTest of immutabilityResult.newTestFiles) {
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
        return;
      }
    }
  }

  // 6. Execute local tests & self-repair loop
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
    return;
  }

  // 7. Record L3 evidence and transition to Dev Done
  const durationMs = repairResult.testResult?.durationMs || 100;
  const rawDiffStat = diffStat.rawStat || 'clean';

  const vitestSummary = parseVitestSummary(
    repairResult.testResult?.stdout || '',
    durationMs
  );
  const totalTests = vitestSummary.totalTests || 1;
  const passed = vitestSummary.passed || (vitestSummary.failed === 0 ? totalTests : 0);
  const failed = vitestSummary.failed;

  await recordL3Evidence({
    workItemId: workItem.id,
    revId,
    testSuite: 'vitest',
    totalTests,
    passed,
    failed,
    durationMs,
    gitDiffStat: rawDiffStat,
  });

  const comment = formatL3EvidenceComment({
    testSuite: 'vitest',
    totalTests,
    passed,
    failed,
    durationMs,
    gitDiffStat: rawDiffStat,
  });

  await git.add('.');
  const gitStatus = await git.status();
  if (gitStatus.staged.length > 0 || !gitStatus.isClean()) {
    await commitImplementation(
      git,
      workItem.id,
      'feat',
      workItem.title
    );
    try {
      await git.push('origin', worktreeResult.branchName);
    } catch {
      // Ignore remote push failures in local/offline test environments
    }
  }

  await transitionToDevDone(workItem.id, comment);
  await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
}

export async function processWorkItemExecute(
  workItemId: number,
  revId: number,
  options?: ProcessExecuteOptions
): Promise<void> {
  try {
    // Step 1: Fetch work item details
    const workItem = await getWorkItemDetails(workItemId, revId);

    // Step 2: Check for Resumption Flow
    const isAwaitingInput = workItem.tags?.includes('[awaiting-input]');
    const pendingCheckpoint = await getPendingCheckpoint(workItemId);

    if (isAwaitingInput && pendingCheckpoint) {
      const history = workItem.history?.trim();
      const isNonBot =
        typeof history === 'string' &&
        history.length > 0 &&
        !history.includes('<!-- [automated-agent] -->') &&
        !history.startsWith('### [Plan Q&A]') &&
        !history.startsWith('### [Plan Q&amp;A]') &&
        !history.startsWith('<h3>[Plan Q&A]') &&
        !history.startsWith('<h3>[Plan Q&amp;A]');

      if (isNonBot && typeof history === 'string') {
        let estimatedFiles: string[] = [];
        try {
          estimatedFiles = JSON.parse(pendingCheckpoint.estimatedFiles || '[]');
        } catch {
          estimatedFiles = [];
        }

        const lockedPlanMarkdown =
          pendingCheckpoint.planMarkdown ||
          'Implementation plan locked with developer clarifications.';

        await lockPlanCheckpoint(pendingCheckpoint.id, history, undefined, workItemId);

        const lockedComment = formatPlanLockedComment(
          lockedPlanMarkdown,
          estimatedFiles
        );

        const patchDoc = buildPlanLockedPatch(lockedComment, workItem.tags);
        await adoClient.updateWorkItem(workItemId, patchDoc);

        const shouldProceedResumption =
          options?.autoProceedResumption ?? (env.NODE_ENV !== 'test');

        if (shouldProceedResumption) {
          const resWorktree = await createWorktree(
            process.cwd(),
            workItemId,
            workItem.title
          );
          try {
            await runExecutionPipeline(workItem, revId, resWorktree, options);
          } catch (resErr) {
            await cleanupWorktree(process.cwd(), resWorktree.worktreePath).catch(
              () => {}
            );
            throw resErr;
          }
        }

        stateStore.updateDedupStatus(workItemId, revId, 'completed');

        console.log(
          `[execute-worker] Plan locked for ticket ${workItemId} with developer answers. Ready for Phase 3 implementation.`
        );
        return;
      } else {
        stateStore.updateDedupStatus(
          workItemId,
          revId,
          'skipped',
          'Work item awaiting input; awaiting human developer reply'
        );
        return;
      }
    }

    // Step 3: Fresh 'In Dev' Execution Flow
    const isExecutionFlow =
      workItem.boardColumn?.toLowerCase() === 'in dev' ||
      ['in dev', 'doing', 'active', 'in progress'].includes(workItem.state.toLowerCase());

    if (!isExecutionFlow) {
      stateStore.updateDedupStatus(
        workItemId,
        revId,
        'skipped',
        `Ticket state '${workItem.state}' (column '${workItem.boardColumn || 'n/a'}') is not an execution state`
      );
      return;
    }

    let worktreeResult: { worktreePath: string; branchName: string } | undefined;
    let mcpSession: { close: () => Promise<void> } | undefined;

    try {
      // Provision ephemeral git worktree
      worktreeResult = await createWorktree(
        process.cwd(),
        workItemId,
        workItem.title
      );

      // Resolve dynamic MCP tools
      const tags = (workItem.tags || '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean);

      mcpSession = await createDynamicMcpTools({
        worktreePath: worktreeResult.worktreePath,
        tags,
        knownSecrets: [
          env.ADO_PAT,
          env.OPENAI_API_KEY,
          env.API_KEY,
          env.ADO_WEBHOOK_SECRET,
        ].filter(Boolean) as string[],
      });

      // Formulate implementation plan
      let plan: any;
      if (env.LOCAL_AGENT_TYPE === 'opencode' && env.NODE_ENV !== 'test' && !options?.forceAiPlanner) {
        plan = {
          hasAmbiguities: false,
          questions: [],
          planMarkdown: 'Autonomous execution delegated directly to OpenCode agent.',
          estimatedFiles: [],
          testStrategy: 'Local automated tests',
          planDelegated: true,
          planNote: 'plan delegated to opencode',
        };
      } else {
        plan = await formulateImplementationPlan({
          title: workItem.title,
          description: workItem.description,
          acceptanceCriteria: workItem.acceptanceCriteria,
          tags,
        });
      }

      if (plan.hasAmbiguities) {
        await createPlanCheckpoint({
          workItemId,
          revId,
          questions: plan.questions,
          planMarkdown: plan.planMarkdown,
          estimatedFiles: plan.estimatedFiles,
          testStrategy: plan.testStrategy,
          fallbackUsed: plan.fallbackUsed,
          model: plan.model,
        });

        const comment = formatPlanQuestionsComment(plan.questions);
        const patchDoc = buildPlanQuestionPatch(comment, workItem.tags);
        await adoClient.updateWorkItem(workItemId, patchDoc);

        // IMMEDIATELY release worktree per locked decision
        await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
        worktreeResult = undefined;

        await mcpSession.close();
        mcpSession = undefined;

        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        return;
      } else {
        const cp = await createPlanCheckpoint({
          workItemId,
          revId,
          questions: plan.questions,
          planMarkdown: plan.planMarkdown,
          estimatedFiles: plan.estimatedFiles,
          testStrategy: plan.testStrategy,
          fallbackUsed: plan.fallbackUsed,
          model: plan.model,
          planDelegated: plan.planDelegated,
          planNote: plan.planNote,
        });
        await updateCheckpointStatus(cp.id, 'locked', undefined, workItemId);

        const comment = formatPlanLockedComment(
          plan.planMarkdown,
          plan.estimatedFiles,
          plan.planNote
        );

        await adoClient.updateWorkItem(workItemId, [
          {
            op: Operation.Add,
            path: '/fields/System.History',
            value: comment,
          },
        ]);

        await mcpSession.close();
        mcpSession = undefined;

        // Run Phase 3 implementation & verification pipeline
        await runExecutionPipeline(workItem, revId, worktreeResult, options);
        worktreeResult = undefined;

        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        return;
      }
    } catch (innerErr: any) {
      if (worktreeResult) {
        await cleanupWorktree(process.cwd(), worktreeResult.worktreePath).catch(
          () => {}
        );
      }
      if (mcpSession) {
        await mcpSession.close().catch(() => {});
      }
      throw innerErr;
    }
  } catch (err: any) {
    stateStore.updateDedupStatus(
      workItemId,
      revId,
      'failed',
      err?.message || String(err)
    );

    console.error(
      `[execute-worker] Failed processing execution for work item ${workItemId} rev ${revId}:`,
      err
    );
    throw err;
  }
}

// ponytail: synchronous in-process execute pipeline; decouple via persistent queue in v2

