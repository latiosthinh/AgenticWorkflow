import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { adoClient } from '../ado/client.js';
import { harvestTicketLifecycleData } from './harvester.js';
import { generateRetroReport } from './retro.js';
import { generateRunbookFromLifecycle } from './runbook.js';
import { generateSkillFromLifecycle } from './generator.js';
import { stageAndPublishSkillPr, formatSkillPrComment } from './publisher.js';
import type { LearnedSkill, LearnedRunbook, RetroReport } from './types.js';
import type { L7EvidenceState } from '../state/types.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export interface LearningProcessResult {
  skill: LearnedSkill;
  runbook: LearnedRunbook;
  retro: RetroReport;
  l7Record: L7EvidenceState;
  pullRequestId: number;
  prUrl: string;
}

export interface ProcessLearningFeedbackLoopOptions {
  mockSkill?: LearnedSkill;
  mockRunbook?: LearnedRunbook;
  mockRetroResult?: RetroReport;
  mockPrCreator?: any;
  repoRoot?: string;
}

export async function processLearningFeedbackLoop(
  workItemId: number,
  options?: ProcessLearningFeedbackLoopOptions
): Promise<LearningProcessResult> {
  // 1. Harvest lifecycle data
  const lifecycle = await harvestTicketLifecycleData(workItemId);

  // 2. Synthesize retro takeaways, action items, and DORA trend deltas
  const retro = options?.mockRetroResult || (await generateRetroReport(lifecycle));

  // 3. Synthesize runbook
  const runbook = await generateRunbookFromLifecycle(lifecycle, retro, {
    mockRunbook: options?.mockRunbook,
  });

  // 4. Synthesize skill with prompt-injection defenses
  const skill = await generateSkillFromLifecycle(lifecycle, {
    mockSkill: options?.mockSkill,
  });

  // 5. Stage skill & runbook on branch and open single PR
  const { pullRequestId, prUrl, branchName } = await stageAndPublishSkillPr({
    workItemId,
    skill,
    runbook,
    repoRoot: options?.repoRoot,
    mockPrCreator: options?.mockPrCreator,
  });

  const now = new Date().toISOString();
  const l7Record: L7EvidenceState = {
    takeaways: retro.takeaways,
    actionItems: retro.actionItems.map(
      (a) => `${a.priority}: ${a.action} (${a.owner}, ref: ${a.trackingRef})`
    ),
    runbookDiffPrUrl: runbook.hasChanges ? prUrl : null,
    skillPrUrl: prUrl,
    gateFriction: retro.gateFriction,
    trendDeltas: retro.trendDeltas as Record<string, unknown>,
    createdAt: now,
    completedAt: now,
  };

  // 6. Persist full L7 record to StateStore inside dedicated lane before notifying ADO (T-06-04 mitigation)
  await workItemQueueManager.runInLane(workItemId, async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      if (!draft.retroRecords) {
        draft.retroRecords = [];
      }
      draft.retroRecords.push(l7Record);
      draft.l7Evidence = l7Record;

      if (!draft.skillsPrs) {
        draft.skillsPrs = [];
      }
      draft.skillsPrs.push({
        skillName: skill.frontmatter.name,
        branchName,
        pullRequestId,
        prUrl,
        status: 'pending_review',
        summary: skill.summary,
        createdAt: now,
      });
    });
  });

  // 7. Post notification comment on work item discussion
  const comment = formatSkillPrComment({
    workItemId,
    skillName: skill.frontmatter.name,
    pullRequestId,
    prUrl,
    description: skill.summary,
  });

  const patch: JsonPatchDocument = [
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: comment,
    },
  ];

  await adoClient.updateWorkItem(workItemId, patch);

  return {
    skill,
    runbook,
    retro,
    l7Record,
    pullRequestId,
    prUrl,
  };
}
