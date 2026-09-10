import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { deploymentRecords } from '../db/schema.js';
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
  compileL1L6EvidenceIndex,
  formatEvidenceIndexComment,
  type L1L6EvidenceSummary,
} from './evidence-index.js';
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

  db.insert(deploymentRecords)
    .values({
      workItemId,
      pipelineRunId: `run-${Date.now()}`,
      stageName: 'DeployToProduction',
      environmentName,
      commitSha,
      status: 'pending_approval',
      releaseNotes: packet.releaseNotes,
      rollbackPlan: packet.rollback.revertCommand,
      migrationRisk: packet.migrationRisk.riskLevel,
      createdAt: new Date(),
    })
    .run();

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
  }
): Promise<{ result: TelemetryEvaluationResult; summary?: L1L6EvidenceSummary }> {
  const details = await getWorkItemDetails(workItemId);

  const evalResult = await evaluateProductionTelemetry({
    workItemId,
    windowMinutes: options?.windowMinutes,
    mockMetrics: options?.mockMetrics,
  });

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

  // Telemetry Passed: Transition to Done with unified L1-L6 Evidence Index
  db.update(deploymentRecords)
    .set({
      status: 'deployed',
      deployedAt: new Date(),
    })
    .where(eq(deploymentRecords.workItemId, workItemId))
    .run();

  const evidenceSummary = await compileL1L6EvidenceIndex(workItemId);
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
  return { result: evalResult, summary: evidenceSummary };
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

  // 2. Telemetry evaluation & completion
  await processTelemetryEvaluation(workItemId, {
    mockMetrics: options?.mockMetrics,
    windowMinutes: options?.windowMinutes,
    commitSha: options?.commitSha,
  });
}
