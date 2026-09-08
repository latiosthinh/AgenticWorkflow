import { JsonPatchDocument, Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { adoClient, withRetry } from './client.js';

export interface WorkItemDetails {
  id: number;
  rev: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  state: string;
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

export async function getWorkItemDetails(workItemId: number): Promise<WorkItemDetails> {
  return withRetry(async () => {
    const witApi = await adoClient.getWorkItemTrackingApi();
    const workItem = await witApi.getWorkItem(workItemId);
    const fields = workItem.fields || {};
    return {
      id: workItem.id ?? workItemId,
      rev: workItem.rev ?? fields['System.Rev'] ?? 1,
      title: fields['System.Title'] || '',
      description: fields['System.Description'] || '',
      acceptanceCriteria: fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
      state: fields['System.State'] || '',
    };
  });
}

export async function transitionToReadyToDev(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const patchDoc = buildReadyToDevPatch(htmlComment);
  return withRetry(async () => {
    const witApi = await adoClient.getWorkItemTrackingApi();
    if (witApi.updateWorkItem.length === 2) {
      return (witApi.updateWorkItem as any)(patchDoc, workItemId);
    }
    return (witApi.updateWorkItem as any)(undefined, patchDoc, workItemId);
  });
}

export async function postFeedbackComment(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const patchDoc = buildFeedbackPatch(htmlComment);
  return withRetry(async () => {
    const witApi = await adoClient.getWorkItemTrackingApi();
    if (witApi.updateWorkItem.length === 2) {
      return (witApi.updateWorkItem as any)(patchDoc, workItemId);
    }
    return (witApi.updateWorkItem as any)(undefined, patchDoc, workItemId);
  });
}
// ponytail: standard JSON patch fields; add custom area and iteration paths in v2
