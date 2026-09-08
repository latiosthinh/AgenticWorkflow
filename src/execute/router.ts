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
}

// ponytail: static routing table; make dynamic via pluggable pipeline plugins in v2
