import {
  JsonPatchDocument,
  JsonPatchOperation,
  Operation,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { adoClient } from './client.js';

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
// ponytail: standard JSON patch fields; add custom area and iteration paths in v2
