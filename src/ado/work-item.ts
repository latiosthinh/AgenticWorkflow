import {
  JsonPatchDocument,
  JsonPatchOperation,
  Operation,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import { adoClient } from './client.js';
import {
  buildDevDonePatch,
  buildRepairExhaustedPatch,
  buildContractConflictPatch,
} from '../test-runner/evidence.js';
import { buildDevDoneAcceptancePatch } from '../accept/packet.js';
import { buildEscalationPatch } from '../accept/breaker.js';

export interface WorkItemDetails {
  id: number;
  rev: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  state: string;
  tags?: string;
  history?: string;
}

export function buildTagPatch(
  currentTags: string | undefined,
  tagToAdd?: string,
  tagToRemove?: string
): JsonPatchOperation[] & JsonPatchDocument {
  const existing = currentTags
    ? currentTags
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  let updated = [...existing];
  if (tagToAdd && !updated.includes(tagToAdd)) {
    updated.push(tagToAdd);
  }
  if (tagToRemove) {
    updated = updated.filter((t) => t !== tagToRemove);
  }

  const tagValue = updated.join('; ');
  return [
    {
      op: currentTags !== undefined ? Operation.Replace : Operation.Add,
      path: '/fields/System.Tags',
      value: tagValue,
    },
  ] as unknown as JsonPatchOperation[] & JsonPatchDocument;
}

export function buildPlanQuestionPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(currentTags, '[awaiting-input]');
  return [
    ...tagPatches,
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}

export function buildPlanLockedPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(currentTags, undefined, '[awaiting-input]');
  return [
    ...tagPatches,
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}

export function buildReadyToDevPatch(htmlComment: string): JsonPatchDocument {
  return [
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Ready to Dev',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ];
}

export function buildFeedbackPatch(htmlComment: string): JsonPatchDocument {
  return [
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ];
}

export async function getWorkItemDetails(
  workItemId: number,
  revId?: number
): Promise<WorkItemDetails> {
  const workItem = revId
    ? await adoClient.getRevision(workItemId, revId)
    : await adoClient.getWorkItem(workItemId);
  const fields = workItem.fields || {};
  return {
    id: workItem.id ?? workItemId,
    rev: workItem.rev ?? fields['System.Rev'] ?? 1,
    title: fields['System.Title'] || '',
    description: fields['System.Description'] || '',
    acceptanceCriteria: fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
    state: fields['System.State'] || '',
    tags: fields['System.Tags'] || '',
    history: fields['System.History'] || '',
  };
}

export async function updateWorkItemTags(
  workItemId: number,
  tagToAdd?: string,
  tagToRemove?: string
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildTagPatch(details.tags, tagToAdd, tagToRemove);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function transitionToReadyToDev(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const patchDoc = buildReadyToDevPatch(htmlComment);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function postFeedbackComment(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const patchDoc = buildFeedbackPatch(htmlComment);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function transitionToDevDone(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildDevDonePatch(htmlComment, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function flagTicketBlocked(
  workItemId: number,
  htmlComment: string,
  type: 'contract-conflict' | 'repair-exhausted' | 'diff-ceiling'
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  let patchDoc: any;
  if (type === 'contract-conflict') {
    patchDoc = buildContractConflictPatch(htmlComment, details.tags);
  } else if (type === 'repair-exhausted') {
    patchDoc = buildRepairExhaustedPatch(htmlComment, details.tags);
  } else {
    const tagPatches = buildTagPatch(
      details.tags,
      '[diff-ceiling-exceeded]',
      '[awaiting-input]'
    );
    patchDoc = [
      ...tagPatches,
      {
        op: Operation.Replace,
        path: '/fields/System.State',
        value: 'Blocked',
      },
      {
        op: Operation.Add,
        path: '/fields/System.History',
        value: htmlComment,
      },
    ];
  }
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function transitionToDevDoneWithPacket(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildDevDoneAcceptancePatch(htmlComment, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function escalateReworkToBlocked(
  workItemId: number,
  bounceCount: number
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildEscalationPatch(workItemId, bounceCount, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export function buildMergeReadyForQaPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[pr-merged]',
    '[awaiting-acceptance]'
  );
  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Ready for QA',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}

export async function transitionToReadyForQa(
  workItemId: number,
  htmlComment: string
): Promise<WorkItem> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildMergeReadyForQaPatch(htmlComment, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

// ponytail: standard JSON patch fields; add custom area and iteration paths in v2
