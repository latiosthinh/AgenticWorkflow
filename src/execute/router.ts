import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dedupEvents } from '../db/schema.js';
import {
  getWorkItemDetails,
  updateWorkItemTags,
  escalateReworkToBlocked,
} from '../ado/work-item.js';
import { processWorkItemAudit } from '../auditor/worker.js';
import { processWorkItemExecute } from './worker.js';
import { detectAcceptanceVerdict } from '../accept/verdict.js';
import {
  evaluateCircuitBreaker,
  resetCircuitBreaker,
} from '../accept/breaker.js';
import { processWorkItemRework } from './rework-worker.js';

export async function routeWorkItemEvent(
  workItemId: number,
  revId: number,
  options?: any
): Promise<void> {
  try {
    const workItem = await getWorkItemDetails(workItemId, revId);

    let previousState: string | undefined;
    if (revId > 1) {
      try {
        const prevDetails = await getWorkItemDetails(workItemId, revId - 1);
        previousState = prevDetails.state;
      } catch {
        // Ignore previous revision lookup failure
      }
    }

    const verdict = detectAcceptanceVerdict({
      currentState: workItem.state,
      previousState,
      historyComment: workItem.history,
      tags: workItem.tags,
    });

    if (verdict.type === 'reset_rework') {
      resetCircuitBreaker(workItemId);
      db.update(dedupEvents)
        .set({ status: 'completed' })
        .where(
          and(
            eq(dedupEvents.workItemId, workItemId),
            eq(dedupEvents.revId, revId)
          )
        )
        .run();
    } else if (verdict.type === 'approve') {
      await updateWorkItemTags(
        workItemId,
        '[acceptance-approved]',
        '[awaiting-acceptance]'
      );
      db.update(dedupEvents)
        .set({ status: 'completed' })
        .where(
          and(
            eq(dedupEvents.workItemId, workItemId),
            eq(dedupEvents.revId, revId)
          )
        )
        .run();
    } else if (verdict.type === 'reject') {
      const breaker = await evaluateCircuitBreaker(workItemId, 'accept');
      if (!breaker.allowed) {
        await escalateReworkToBlocked(workItemId, breaker.currentCount);
        db.update(dedupEvents)
          .set({ status: 'completed' })
          .where(
            and(
              eq(dedupEvents.workItemId, workItemId),
              eq(dedupEvents.revId, revId)
            )
          )
        .run();
      } else {
        await processWorkItemRework(workItemId, revId, verdict.feedback, options);
      }
    } else if (workItem.state === 'New') {
      await processWorkItemAudit(workItemId, revId);
    } else if (
      workItem.state === 'In Dev' ||
      (workItem.tags && workItem.tags.includes('[awaiting-input]'))
    ) {
      await processWorkItemExecute(workItemId, revId, options);
    } else {
      db.update(dedupEvents)
        .set({
          status: 'skipped',
          errorMessage: `Ticket state '${workItem.state}' has no active handler`,
        })
        .where(
          and(
            eq(dedupEvents.workItemId, workItemId),
            eq(dedupEvents.revId, revId)
          )
        )
        .run();
    }
  } catch (err: any) {
    db.update(dedupEvents)
      .set({
        status: 'failed',
        errorMessage: err?.message || String(err),
      })
      .where(
        and(
          eq(dedupEvents.workItemId, workItemId),
          eq(dedupEvents.revId, revId)
        )
      )
      .run();
    console.error(
      `[router] Failed routing work item ${workItemId} rev ${revId}:`,
      err
    );
    throw err;
  }
}

// ponytail: static routing table; make dynamic via pluggable pipeline plugins in v2
