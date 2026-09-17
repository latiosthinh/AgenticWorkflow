import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { adoClient } from '../ado/client.js';
import { harvestTicketLifecycleData } from './harvester.js';
import { generateSkillFromLifecycle } from './generator.js';
import { stageAndPublishSkillPr, formatSkillPrComment } from './publisher.js';
import type { LearnedSkill } from './types.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export interface LearningProcessResult {
  skill: LearnedSkill;
  pullRequestId: number;
  prUrl: string;
}

export async function processLearningFeedbackLoop(
  workItemId: number,
  options?: { mockSkill?: LearnedSkill; mockPrCreator?: any; repoRoot?: string }
): Promise<LearningProcessResult> {
  // 1. Harvest lifecycle data
  const lifecycle = await harvestTicketLifecycleData(workItemId);

  // 2. Synthesize skill with prompt-injection defenses
  const skill = await generateSkillFromLifecycle(lifecycle, {
    mockSkill: options?.mockSkill,
  });

  // 3. Stage skill on branch and open PR
  const { pullRequestId, prUrl, branchName } = await stageAndPublishSkillPr({
    workItemId,
    skill,
    repoRoot: options?.repoRoot,
    mockPrCreator: options?.mockPrCreator,
  });

  // 4. Persist to StateStore skillsPrs
  await workItemQueueManager.runInLane(workItemId, async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
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
        createdAt: new Date().toISOString(),
      });
    });
  });

  // 5. Post notification comment on work item discussion
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
    pullRequestId,
    prUrl,
  };
}
