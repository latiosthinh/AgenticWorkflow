import { stateStore } from '../state/index.js';
import sanitizeHtml from 'sanitize-html';
import { workItemQueueManager, laneContext } from '../queue/lane-manager.js';
import { adoClient } from '../ado/client.js';
import { buildTagPatch, postFeedbackComment } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export async function evaluateScopeBreaker(
  workItemId: number,
  feedback?: string
): Promise<{ allowed: boolean; iterationCount: number }> {
  let allowed = true;
  let iterationCount = 1;

  const mutate = async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      const prev = draft.scopeLock?.iterationCount ?? 0;
      iterationCount = prev + 1;
      const now = new Date().toISOString();
      const fb = feedback ?? draft.scopeLock?.feedback ?? null;

      if (prev >= 2) {
        allowed = false;
        draft.scopeLock = {
          status: 'blocked',
          iterationCount,
          requestedAt: draft.scopeLock?.requestedAt ?? now,
          lockedAt: null,
          lockedBy: null,
          feedback: fb,
          remindedAt: draft.scopeLock?.remindedAt ?? null,
          escalatedAt: draft.scopeLock?.escalatedAt ?? now,
          createdAt: draft.scopeLock?.createdAt ?? now,
          updatedAt: now,
        };
      } else {
        allowed = true;
        draft.scopeLock = {
          status: 'rejected',
          iterationCount,
          requestedAt: draft.scopeLock?.requestedAt ?? now,
          lockedAt: null,
          lockedBy: null,
          feedback: fb,
          remindedAt: draft.scopeLock?.remindedAt ?? null,
          escalatedAt: null,
          createdAt: draft.scopeLock?.createdAt ?? now,
          updatedAt: now,
        };
      }
    });
  };

  if (laneContext.getStore()?.workItemId === workItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(workItemId, mutate);
  }

  return { allowed, iterationCount };
}

export async function resetScopeBreaker(
  workItemId: number,
  currentTags?: string,
  updateAdo = false
): Promise<JsonPatchDocument> {
  const mutate = async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      if (draft.scopeLock) {
        const now = new Date().toISOString();
        draft.scopeLock.iterationCount = 0;
        draft.scopeLock.escalatedAt = null;
        draft.scopeLock.remindedAt = null;
        draft.scopeLock.requestedAt = now;
        if (draft.scopeLock.status === 'blocked' || draft.scopeLock.status === 'rejected') {
          draft.scopeLock.status = 'pending';
        }
        draft.scopeLock.updatedAt = now;
      }
    });
  };

  if (laneContext.getStore()?.workItemId === workItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(workItemId, mutate);
  }

  const patch = buildScopeResetPatch(currentTags);
  if (updateAdo) {
    await adoClient.updateWorkItem(workItemId, patch);
  }
  return patch;
}

export function buildScopeResetPatch(
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[awaiting-scope-lock]',
    '[scope-unresolved]'
  );

  const commentHtml = `<p><strong>[Scope Reset] Scope Review Breaker Reset by PM</strong></p><p>Refinement circuit breaker reset. Work item unblocked and returned to scope review.</p>\n<!-- [automated-agent] -->`;

  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'New',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: commentHtml,
    },
  ] as unknown as JsonPatchDocument;
}

export async function handleScopeReset(
  workItemId: number,
  currentTags?: string
): Promise<JsonPatchDocument> {
  let tags = currentTags;
  if (tags === undefined) {
    try {
      const item = await adoClient.getWorkItem(workItemId);
      tags = item.fields?.['System.Tags'] || '';
    } catch {
      tags = '';
    }
  }
  return resetScopeBreaker(workItemId, tags, true);
}

export function buildScopeApprovedPatch(
  htmlComment?: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[scope-locked]',
    '[awaiting-scope-lock]'
  );

  const patch: any[] = [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Ready to Dev',
    },
  ];

  if (htmlComment) {
    patch.push({
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    });
  }

  return patch as unknown as JsonPatchDocument;
}

export function buildScopeEscalationPatch(
  iterationCountOrWorkItemId: number,
  iterationCountOrCurrentTags?: number | string,
  maybeCurrentTags?: string
): JsonPatchDocument {
  let iterationCount: number;
  let currentTags: string | undefined;

  if (typeof iterationCountOrCurrentTags === 'number') {
    iterationCount = iterationCountOrCurrentTags;
    currentTags = maybeCurrentTags;
  } else {
    iterationCount = iterationCountOrWorkItemId;
    currentTags = iterationCountOrCurrentTags;
  }

  const tagPatches = buildTagPatch(
    currentTags,
    '[scope-unresolved]',
    '[awaiting-scope-lock]'
  );

  const commentHtml = `<h3>[Scope Escalated] Refinement Limit Exceeded</h3>
<p>Work item has reached <strong>${iterationCount} scope review rejections</strong>, exceeding the refinement policy limit (2).</p>
<p><strong>Action required:</strong> PM/Lead manual intervention required. To reset the scope gate after revising requirements, post <code>[reset-scope]</code>.</p>
<!-- [automated-agent] -->`;

  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: commentHtml,
    },
  ] as unknown as JsonPatchDocument;
}

export async function handleScopeApproval(
  workItemId: number,
  currentTags?: string,
  actor?: string
): Promise<void> {
  const mutate = async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      const now = new Date().toISOString();
      if (draft.scopeLock) {
        draft.scopeLock.status = 'locked';
        draft.scopeLock.lockedAt = now;
        draft.scopeLock.lockedBy = actor || 'pm';
        draft.scopeLock.updatedAt = now;
      } else {
        draft.scopeLock = {
          status: 'locked',
          iterationCount: 0,
          requestedAt: now,
          lockedAt: now,
          lockedBy: actor || 'pm',
          feedback: null,
          remindedAt: null,
          escalatedAt: null,
          createdAt: now,
          updatedAt: now,
        };
      }
    });
  };

  if (laneContext.getStore()?.workItemId === workItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(workItemId, mutate);
  }

  let tags = currentTags;
  if (tags === undefined) {
    try {
      const item = await adoClient.getWorkItem(workItemId);
      tags = item.fields?.['System.Tags'] || '';
    } catch {
      tags = '';
    }
  }

  const sanitizedActor = actor
    ? sanitizeHtml(actor, { allowedTags: [], disallowedTagsMode: 'escape' })
    : undefined;

  const commentHtml = `<p><strong>[Scope Locked] Scope Approved by PM</strong></p><p>Scope lock approved${
    sanitizedActor ? ` by ${sanitizedActor}` : ''
  }. Work item transitioned to <strong>Ready to Dev</strong>.</p>\n<!-- [automated-agent] -->`;

  const patchDoc = buildScopeApprovedPatch(commentHtml, tags);
  await adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function handleScopeRejection(
  workItemId: number,
  feedback: string,
  currentTags?: string,
  actor?: string
): Promise<{ allowed: boolean; iterationCount: number }> {
  const breaker = await evaluateScopeBreaker(workItemId, feedback);

  let tags = currentTags;
  if (tags === undefined) {
    try {
      const item = await adoClient.getWorkItem(workItemId);
      tags = item.fields?.['System.Tags'] || '';
    } catch {
      tags = '';
    }
  }

  if (!breaker.allowed) {
    const patchDoc = buildScopeEscalationPatch(breaker.iterationCount, tags);
    await adoClient.updateWorkItem(workItemId, patchDoc);
  } else {
    const sanitizedFeedback = sanitizeHtml(feedback, {
      allowedTags: ['b', 'i', 'em', 'strong', 'code', 'p', 'br', 'ul', 'ol', 'li'],
    });
    const commentHtml = `<p><strong>[Scope Rejected] Scope Changes Requested</strong></p><p>${sanitizedFeedback}</p>\n<!-- [automated-agent] -->`;
    await postFeedbackComment(workItemId, commentHtml);
  }

  return breaker;
}

// ponytail: hardcoded 2-rejection refinement cap; support dynamic team thresholds in v2
