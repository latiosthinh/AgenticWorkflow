import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { adoClient } from '../ado/client.js';
import { getWorkItemDetails, buildTagPatch } from '../ado/work-item.js';
import {
  buildL5ReadinessPacket,
  formatL5ReadinessComment,
  buildDeployingPatch,
} from './packet.js';
import {
  evaluateProductionTelemetry,
  formatTelemetryAlertComment,
  type TelemetryMetrics,
  type TelemetryEvaluationResult,
} from './telemetry.js';
import {
  compileL1L7EvidenceIndex,
  formatEvidenceIndexComment,
  type L1L7EvidenceSummary,
} from './evidence-index.js';
import {
  executeTwoStrikeSmokeFilter,
  formatSmokeAlertComment,
  type TwoStrikeSmokeResult,
} from './smoke.js';
import { processLearningFeedbackLoop, type LearningProcessResult } from '../learn/worker.js';
import { formatRetroAlertComment } from '../learn/retro.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export interface ProcessDeployOptions {
  commitSha?: string;
  filesModified?: string[];
  environmentName?: string;
  mockMetrics?: TelemetryMetrics;
  windowMinutes?: number;
  skipPreparation?: boolean;
  smokeUrl?: string;
  mockSmokeResult?: Partial<TwoStrikeSmokeResult>;
  mockSkill?: any;
  mockRunbook?: any;
  mockRetroResult?: any;
  mockPrCreator?: any;
  repoRoot?: string;
}

export async function processDeploymentPreparation(
  workItemId: number,
  options?: { commitSha?: string; filesModified?: string[]; environmentName?: string }
): Promise<void> {
  const details = await getWorkItemDetails(workItemId);

  const commitSha = options?.commitSha || 'main';
  const filesModified = options?.filesModified || [];
  const environmentName = options?.environmentName || 'Production';

  const packet = buildL5ReadinessPacket({
    workItemId,
    title: details.title || 'Production Deployment',
    commitSha,
    filesModified,
    environmentName,
  });

  await workItemQueueManager.runInLane(workItemId, async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      if (!draft.deploymentRecords) {
        draft.deploymentRecords = [];
      }
      draft.deploymentRecords.push({
        pipelineRunId: `run-${Date.now()}`,
        stageName: 'DeployToProduction',
        environmentName,
        commitSha,
        status: 'pending_approval',
        releaseNotes: packet.releaseNotes,
        rollbackPlan: packet.rollback.revertCommand,
        migrationRisk: packet.migrationRisk.riskLevel,
        createdAt: new Date().toISOString(),
      });
    });
  });

  const l5Comment = formatL5ReadinessComment(packet);
  const tagPatch = buildDeployingPatch(details.tags);

  const patch: JsonPatchDocument = [
    ...tagPatch,
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: l5Comment,
    },
  ];

  await adoClient.updateWorkItem(workItemId, patch);
}

export async function processTelemetryEvaluation(
  workItemId: number,
  options?: {
    mockMetrics?: TelemetryMetrics;
    windowMinutes?: number;
    commitSha?: string;
    rollbackCommand?: string;
    mockSkill?: any;
    mockRunbook?: any;
    mockRetroResult?: any;
    mockPrCreator?: any;
    repoRoot?: string;
  }
): Promise<{ result: TelemetryEvaluationResult; summary?: L1L7EvidenceSummary }> {
  const details = await getWorkItemDetails(workItemId);

  let evalResult: TelemetryEvaluationResult;
  try {
    evalResult = await evaluateProductionTelemetry({
      workItemId,
      windowMinutes: options?.windowMinutes,
      mockMetrics: options?.mockMetrics,
    });
  } catch (err: any) {
    // Fail closed: without L6 telemetry evidence the ticket must NOT transition to Done.
    // Leave state untouched; router records the failure and the lane queue catches it.
    console.warn(
      `[deploy-worker] Telemetry evaluation failed for #${workItemId}; blocking Done transition (fail-closed):`,
      err?.message
    );
    throw err;
  }

  const commitSha = options?.commitSha || 'main';
  const rollbackCommand =
    options?.rollbackCommand || `git revert -m 1 ${commitSha} && git push origin main`;

  if (evalResult.breached) {
    // Breach: bounce to In Dev with [deploy-regressed]
    const alertComment = formatTelemetryAlertComment({
      workItemId,
      result: evalResult,
      commitSha,
      rollbackCommand,
    });

    const tagPatch = buildTagPatch(details.tags, '[deploy-regressed]', '[deploying]');
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
        value: alertComment,
      },
    ];

    await adoClient.updateWorkItem(workItemId, patch);
    return { result: evalResult };
  }

  // Telemetry Passed: Update deployment record inside lane
  await workItemQueueManager.runInLane(workItemId, async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      if (draft.deploymentRecords && draft.deploymentRecords.length > 0) {
        const lastRecord = draft.deploymentRecords[draft.deploymentRecords.length - 1];
        lastRecord.status = 'deployed';
        lastRecord.deployedAt = new Date().toISOString();
      }
    });
  });

  // Await retrospective feedback loop before Done with 2-attempt retry cap
  let retroOutcome: LearningProcessResult | undefined;
  let retroError: Error | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      retroOutcome = await processLearningFeedbackLoop(workItemId, {
        mockSkill: options?.mockSkill,
        mockRunbook: options?.mockRunbook,
        mockRetroResult: options?.mockRetroResult,
        mockPrCreator: options?.mockPrCreator,
        repoRoot: options?.repoRoot,
      });
      retroError = undefined;
      break;
    } catch (err: any) {
      retroError = err;
      console.warn(
        `[deploy-worker] Retro feedback loop attempt ${attempt} failed for #${workItemId}:`,
        err?.message
      );
    }
  }

  if (retroError || !retroOutcome) {
    const alertComment = formatRetroAlertComment({
      workItemId,
      errorMessage: retroError?.message || 'Retrospective feedback loop failed after retry',
    });
    const tagPatch = buildTagPatch(details.tags, '[retro-failed]', '[deploying]');
    await adoClient.updateWorkItem(workItemId, [
      ...tagPatch,
      {
        op: Operation.Add,
        path: '/fields/System.History',
        value: alertComment,
      },
    ]);
    throw new Error(
      `Retrospective feedback loop failed after retry for #${workItemId}; Done transition halted`
    );
  }

  // Compile L1-L7 evidence index fail-closed
  const evidenceSummary = await compileL1L7EvidenceIndex(workItemId, { failClosed: true });
  const evidenceComment = formatEvidenceIndexComment(evidenceSummary);

  const tagPatch = buildTagPatch(
    details.tags,
    '[golden-path-complete]',
    '[deploying]'
  );

  const patch: JsonPatchDocument = [
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Done',
    },
    ...tagPatch,
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: evidenceComment,
    },
  ];

  await adoClient.updateWorkItem(workItemId, patch);

  await stateStore.archiveTicket(workItemId);

  return { result: evalResult, summary: evidenceSummary };
}

export async function processSmokeVerification(
  workItemId: number,
  options?: {
    commitSha?: string;
    smokeUrl?: string;
    worktreePath?: string;
    testCommand?: string;
    mockSmokeResult?: Partial<TwoStrikeSmokeResult>;
    rollbackCommand?: string;
  }
): Promise<TwoStrikeSmokeResult> {
  const commitSha = options?.commitSha || 'main';
  const rollbackCommand =
    options?.rollbackCommand || `git revert -m 1 ${commitSha} && git push origin main`;

  let result: TwoStrikeSmokeResult;
  if (options?.mockSmokeResult) {
    const outcome = options.mockSmokeResult.outcome || 'passed';
    const classification =
      options.mockSmokeResult.classification || (outcome === 'failed' ? 'APP' : 'NONE');
    result = {
      outcome,
      classification,
      firstRun: options.mockSmokeResult.firstRun || {
        passed: outcome !== 'failed',
        classification: outcome === 'failed' ? classification : 'NONE',
        failures: [],
        durationMs: 0,
      },
      secondRun: options.mockSmokeResult.secondRun,
      flakeCleared: options.mockSmokeResult.flakeCleared ?? (outcome === 'flaked'),
      identicalFailures: options.mockSmokeResult.identicalFailures ?? (outcome === 'failed'),
      ...options.mockSmokeResult,
    };

    // Record mock smoke evidence to StateStore if none exists
    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        if (!draft.smokeEvidence) {
          draft.smokeEvidence = {
            status: result.outcome === 'failed' ? 'failed' : 'passed',
            classification: result.classification,
            commitSha,
            smokeUrl: options?.smokeUrl || null,
            checksTotal: 1,
            checksPassed: result.outcome === 'failed' ? 0 : 1,
            checksFailed: result.outcome === 'failed' ? 1 : 0,
            durationMs: 0,
            flakeCleared: Boolean(result.flakeCleared),
            createdAt: new Date().toISOString(),
          };
        }
      });
    });
  } else {
    result = await executeTwoStrikeSmokeFilter({
      workItemId,
      commitSha,
      smokeUrl: options?.smokeUrl,
      worktreePath: options?.worktreePath,
      testCommand: options?.testCommand,
    });
  }

  if (result.outcome === 'failed') {
    const details = await getWorkItemDetails(workItemId);

    let reasons: string[] = [];
    if (result.secondRun && result.secondRun.failures.length > 0) {
      reasons = result.secondRun.failures.map((f) => f.errorMessage);
    } else if (result.firstRun && result.firstRun.failures.length > 0) {
      reasons = result.firstRun.failures.map((f) => f.errorMessage);
    }
    if (reasons.length === 0) {
      reasons = [
        result.classification === 'INFRA'
          ? 'Smoke test harness encountered an infrastructure or network error'
          : 'Production smoke verification regression detected',
      ];
    }

    if (result.classification === 'INFRA') {
      const alertComment = formatSmokeAlertComment({
        workItemId,
        commitSha,
        classification: 'INFRA',
        reasons,
      });

      const tagPatch = buildTagPatch(details.tags, '[smoke-harness-error]', '[deploying]');
      const patch: JsonPatchDocument = [
        ...tagPatch,
        {
          op: Operation.Add,
          path: '/fields/System.History',
          value: alertComment,
        },
      ];

      await adoClient.updateWorkItem(workItemId, patch);
    } else {
      const alertComment = formatSmokeAlertComment({
        workItemId,
        commitSha,
        classification: 'APP',
        reasons,
        rollbackCommand,
      });

      const tagPatch = buildTagPatch(details.tags, '[deploy-regressed]', '[deploying]');
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
          value: alertComment,
        },
      ];

      await adoClient.updateWorkItem(workItemId, patch);
    }
  }

  return result;
}

export async function processDeploymentWorkflow(
  workItemId: number,
  revId: number,
  options?: ProcessDeployOptions
): Promise<void> {
  const details = await getWorkItemDetails(workItemId, revId);

  if (details.state !== 'Ready to Deploy') {
    return;
  }

  // 1. Stage preparation & L5 packet
  if (!options?.skipPreparation) {
    await processDeploymentPreparation(workItemId, {
      commitSha: options?.commitSha,
      filesModified: options?.filesModified,
      environmentName: options?.environmentName,
    });
  }

  // 2. Production Smoke Suite (FAIL-FAST)
  const commitSha = options?.commitSha || 'main';
  const smokeResult = await processSmokeVerification(workItemId, {
    commitSha,
    smokeUrl: options?.smokeUrl,
    mockSmokeResult: options?.mockSmokeResult,
  });

  if (smokeResult.outcome === 'failed') {
    // Fail fast: halt deployment workflow immediately without evaluating telemetry window
    return;
  }

  // 3. Telemetry evaluation & completion (only if smoke passed or flake cleared)
  await processTelemetryEvaluation(workItemId, {
    mockMetrics: options?.mockMetrics,
    windowMinutes: options?.windowMinutes,
    commitSha,
    mockSkill: options?.mockSkill,
    mockRunbook: options?.mockRunbook,
    mockRetroResult: options?.mockRetroResult,
    mockPrCreator: options?.mockPrCreator,
    repoRoot: options?.repoRoot,
  });
}
