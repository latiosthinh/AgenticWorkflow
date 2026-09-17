import { stateStore } from '../state/index.js';
import { workItemQueueManager, laneContext } from '../queue/lane-manager.js';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export async function evaluateCircuitBreaker(
  workItemId: number,
  sourceGate: 'accept' | 'pr_review'
): Promise<{ allowed: boolean; currentCount: number }> {
  let allowed = true;
  let currentCount = 1;

  const mutate = async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      const prev = draft.reworkCycles?.bounceCount ?? 0;
      currentCount = prev + 1;
      const now = new Date().toISOString();

      if (prev >= 2) {
        allowed = false;
        draft.reworkCycles = {
          bounceCount: currentCount,
          lastBounceAt: now,
          sourceGate,
          escalatedAt: draft.reworkCycles?.escalatedAt ?? now,
          createdAt: draft.reworkCycles?.createdAt ?? now,
          updatedAt: now,
        };
      } else {
        allowed = true;
        draft.reworkCycles = {
          bounceCount: currentCount,
          lastBounceAt: now,
          sourceGate,
          createdAt: draft.reworkCycles?.createdAt ?? now,
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

  return { allowed, currentCount };
}

export async function resetCircuitBreaker(workItemId: number): Promise<void> {
  const mutate = async () => {
    await stateStore.updateTicketState(workItemId, (draft) => {
      if (draft.reworkCycles) {
        draft.reworkCycles.bounceCount = 0;
        draft.reworkCycles.escalatedAt = null;
        draft.reworkCycles.updatedAt = new Date().toISOString();
      }
    });
  };

  if (laneContext.getStore()?.workItemId === workItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(workItemId, mutate);
  }
}

export function buildEscalationPatch(
  workItemId: number,
  bounceCount: number,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[rework-escalated]',
    '[awaiting-acceptance]'
  );

  const commentHtml = `<h3>[Rework Escalated] Circuit Breaker Tripped</h3>
<p>Work item has reached <strong>${bounceCount} automated rework bounces</strong> across Accept/PR Review gates, exceeding the maximum policy limit (2).</p>
<p><strong>Action required:</strong> Tech Lead manual intervention required. To reset the rework cycle after resolving issues, post <code>[reset-rework]</code>.</p>
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
// ponytail: hardcoded 2-bounce cap in StateStore; support dynamic team thresholds in v2
