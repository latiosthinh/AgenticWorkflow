import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { reworkCycles } from '../db/schema.js';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export async function evaluateCircuitBreaker(
  workItemId: number,
  sourceGate: 'accept' | 'pr_review'
): Promise<{ allowed: boolean; currentCount: number }> {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(reworkCycles)
      .where(eq(reworkCycles.workItemId, workItemId))
      .get();

    const previousCount = existing ? existing.bounceCount : 0;
    const currentCount = previousCount + 1;
    const now = new Date();

    if (previousCount >= 2) {
      const escalatedAt = existing?.escalatedAt ?? now;
      tx.insert(reworkCycles)
        .values({
          workItemId,
          bounceCount: currentCount,
          lastBounceAt: now,
          sourceGate,
          escalatedAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: reworkCycles.workItemId,
          set: {
            bounceCount: currentCount,
            lastBounceAt: now,
            sourceGate,
            escalatedAt,
            updatedAt: now,
          },
        })
        .run();

      return { allowed: false, currentCount };
    }

    tx.insert(reworkCycles)
      .values({
        workItemId,
        bounceCount: currentCount,
        lastBounceAt: now,
        sourceGate,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: reworkCycles.workItemId,
        set: {
          bounceCount: currentCount,
          lastBounceAt: now,
          sourceGate,
          updatedAt: now,
        },
      })
      .run();

    return { allowed: true, currentCount };
  });
}

export function resetCircuitBreaker(workItemId: number): void {
  db.update(reworkCycles)
    .set({
      bounceCount: 0,
      escalatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(reworkCycles.workItemId, workItemId))
    .run();
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
// ponytail: hardcoded 2-bounce cap in SQLite; support dynamic team thresholds in v2
