import {
  JsonPatchDocument,
  JsonPatchOperation,
  Operation,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import sanitizeHtml from 'sanitize-html';
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
  boardColumn?: string;
  kanbanColumnKey?: string;
  tags?: string;
  history?: string;
  revisedBy?: string;
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
  if (tagToAdd) {
    const toAdd = tagToAdd
      .split(';')
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tag of toAdd) {
      if (!updated.includes(tag)) {
        updated.push(tag);
      }
    }
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
  const fields = workItem?.fields || {};
  const changedBy = fields['System.ChangedBy'];
  const changedByStr =
    typeof changedBy === 'object' && changedBy !== null
      ? (changedBy as any).displayName || (changedBy as any).uniqueName || (changedBy as any).name
      : typeof changedBy === 'string'
        ? changedBy
        : undefined;

  const revisedBy =
    (workItem as any)?.revisedBy?.displayName ||
    (workItem as any)?.revisedBy?.name ||
    (workItem as any)?.revisedBy?.uniqueName ||
    changedByStr;

  const kanbanColumnKey = Object.keys(fields).find(
    (k) => (k.endsWith('_Kanban.Column') || k.endsWith('Kanban.Column')) && !k.includes('Done')
  );
  const boardColumn =
    fields['System.BoardColumn'] || (kanbanColumnKey ? fields[kanbanColumnKey] : undefined);

  return {
    id: workItem?.id ?? workItemId,
    rev: workItem?.rev ?? fields['System.Rev'] ?? 1,
    title: fields['System.Title'] || '',
    description: fields['System.Description'] || '',
    acceptanceCriteria:
      fields['Microsoft.VSTS.Common.AcceptanceCriteria'] ||
      fields['System.Description'] ||
      '',
    state: fields['System.State'] || '',
    boardColumn,
    kanbanColumnKey,
    tags: fields['System.Tags'] || '',
    history: fields['System.History'] || '',
    revisedBy,
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
  let details: WorkItemDetails | undefined;
  try {
    details = await getWorkItemDetails(workItemId);
  } catch {
    // Ignore details lookup in tests
  }

  const patchDoc = buildReadyToDevPatch(htmlComment);
  if (details?.kanbanColumnKey) {
    (patchDoc as any[]).unshift({
      op: Operation.Add,
      path: `/fields/${details.kanbanColumnKey}`,
      value: 'Ready for dev',
    });
  }

  try {
    return await adoClient.updateWorkItem(workItemId, patchDoc);
  } catch {
    return await adoClient.updateWorkItem(workItemId, [
      {
        op: Operation.Add,
        path: '/fields/System.History',
        value: htmlComment,
      },
    ]);
  }
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
  const patchDoc = buildDevDonePatch(htmlComment, details?.tags);

  if (details?.kanbanColumnKey) {
    (patchDoc as any[]).unshift({
      op: Operation.Add,
      path: `/fields/${details.kanbanColumnKey}`,
      value: 'Ready for PR',
    });
  }

  try {
    return await adoClient.updateWorkItem(workItemId, patchDoc);
  } catch {
    const fallback = (patchDoc as any[]).filter(
      (op: any) => op.path !== '/fields/System.State'
    );
    return await adoClient.updateWorkItem(workItemId, fallback);
  }
}

export async function flagTicketBlocked(
  workItemId: number,
  htmlComment: string,
  type: 'contract-conflict' | 'repair-exhausted' | 'diff-ceiling' | 'qa-harness-error'
): Promise<any> {
  const sanitizedComment = sanitizeHtml(htmlComment, {
    allowedTags: ['h3', 'p', 'pre', 'code', 'strong', 'ul', 'li', 'b', 'i', 'em', 'a'],
    disallowedTagsMode: 'escape',
  }).trim();
  const safeComment = sanitizedComment.includes('<!-- [automated-agent] -->')
    ? sanitizedComment
    : `${sanitizedComment}\n<!-- [automated-agent] -->`;

  const details = await getWorkItemDetails(workItemId);
  let patchDoc: any;
  if (type === 'contract-conflict') {
    patchDoc = buildContractConflictPatch(safeComment, details.tags);
  } else if (type === 'repair-exhausted') {
    patchDoc = buildRepairExhaustedPatch(safeComment, details.tags);
  } else if (type === 'qa-harness-error') {
    const tagPatches = buildTagPatch(
      details.tags,
      '[qa-harness-error]',
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
        value: safeComment,
      },
    ];
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
        value: safeComment,
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
  const patchDoc = buildMergeReadyForQaPatch(htmlComment, details?.tags);

  if (details?.kanbanColumnKey) {
    (patchDoc as any[]).unshift({
      op: Operation.Add,
      path: `/fields/${details.kanbanColumnKey}`,
      value: 'Ready for QA',
    });
  }

  try {
    return await adoClient.updateWorkItem(workItemId, patchDoc);
  } catch {
    const fallback = (patchDoc as any[]).filter(
      (op: any) => op.path !== '/fields/System.State'
    );
    return await adoClient.updateWorkItem(workItemId, fallback);
  }
}

export {
  buildScopeApprovedPatch,
  buildScopeEscalationPatch,
  buildScopeResetPatch,
} from '../scope/gate.js';

// ponytail: standard JSON patch fields; add custom area and iteration paths in v2
