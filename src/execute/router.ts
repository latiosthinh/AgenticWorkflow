import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dedupEvents } from '../db/schema.js';
import { getWorkItemDetails } from '../ado/work-item.js';
import { processWorkItemAudit } from '../auditor/worker.js';
import { processWorkItemExecute } from './worker.js';

export async function routeWorkItemEvent(
  workItemId: number,
  revId: number
): Promise<void> {
  try {
    const workItem = await getWorkItemDetails(workItemId);

    if (workItem.state === 'New') {
      await processWorkItemAudit(workItemId, revId);
    } else if (
      workItem.state === 'In Dev' ||
      (workItem.tags && workItem.tags.includes('[awaiting-input]'))
    ) {
      await processWorkItemExecute(workItemId, revId);
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
