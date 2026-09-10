import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { qaBounces } from '../db/schema.js';
import { adoClient } from '../ado/client.js';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export const MAX_QA_BOUNCES = 2;

export interface QaBreakerEvaluation {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
}

export async function evaluateQaCircuitBreaker(workItemId: number): Promise<QaBreakerEvaluation> {
  const record = db
    .select()
    .from(qaBounces)
    .where(eq(qaBounces.workItemId, workItemId))
    .get();

  const currentCount = record ? record.bounceCount : 0;
  const allowed = currentCount < MAX_QA_BOUNCES;

  return {
    allowed,
    currentCount,
    maxAllowed: MAX_QA_BOUNCES,
  };
}

export async function recordQaBounce(workItemId: number): Promise<number> {
  const now = new Date();
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(qaBounces)
      .where(eq(qaBounces.workItemId, workItemId))
      .get();

    const newCount = (existing ? existing.bounceCount : 0) + 1;

    tx.insert(qaBounces)
      .values({
        workItemId,
        bounceCount: newCount,
        lastBouncedAt: now,
        escalated: newCount > MAX_QA_BOUNCES ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: qaBounces.workItemId,
        set: {
          bounceCount: newCount,
          lastBouncedAt: now,
          escalated: newCount > MAX_QA_BOUNCES ? 1 : 0,
        },
      })
      .run();

    return newCount;
  });
}

export async function resetQaBounces(workItemId: number): Promise<void> {
  db.insert(qaBounces)
    .values({
      workItemId,
      bounceCount: 0,
      lastBouncedAt: null,
      escalated: 0,
    })
    .onConflictDoUpdate({
      target: qaBounces.workItemId,
      set: {
        bounceCount: 0,
        lastBouncedAt: null,
        escalated: 0,
      },
    })
    .run();
}

export function buildQaEscalationPatch(
  bounceCount: number,
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const existing = currentTags
    ? currentTags
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const updated = existing.filter((t) => t !== '[qa-failed]' && t !== '[qa-verified]');
  if (!updated.includes('[qa-escalated]')) {
    updated.push('[qa-escalated]');
  }

  return [
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    },
    {
      op: currentTags !== undefined ? Operation.Replace : Operation.Add,
      path: '/fields/System.Tags',
      value: updated.join('; '),
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ];
}

export async function escalateQaToBlocked(
  workItemId: number,
  currentBounceCount: number
): Promise<void> {
  // Mark escalated in DB
  db.insert(qaBounces)
    .values({
      workItemId,
      bounceCount: currentBounceCount,
      lastBouncedAt: new Date(),
      escalated: 1,
    })
    .onConflictDoUpdate({
      target: qaBounces.workItemId,
      set: {
        escalated: 1,
        lastBouncedAt: new Date(),
      },
    })
    .run();

  const details = await adoClient.getWorkItem(workItemId);
  const currentTags = details?.fields?.['System.Tags'] as string | undefined;

  const escalationComment = `
<div class="qa-escalation-alert">
  <h3>🛑 QA Rework Breaker Tripped</h3>
  <p>Work item #${workItemId} has exceeded the QA bounce cap (<strong>${MAX_QA_BOUNCES}</strong> automated returns to <em>In Dev</em>).</p>
  <p><strong>Action required:</strong> Manual engineering/QA triage required. State moved to <code>Blocked</code> with tag <code>[qa-escalated]</code>.</p>
</div>
<!-- [automated-agent] -->`.trim();

  const patch = buildQaEscalationPatch(currentBounceCount, escalationComment, currentTags);
  await adoClient.updateWorkItem(workItemId, patch);
}
