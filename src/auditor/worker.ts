import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dedupEvents, auditLogs } from '../db/schema.js';
import {
  getWorkItemDetails,
  transitionToReadyToDev,
  postFeedbackComment,
} from '../ado/work-item.js';
import { formatL1AuditComment } from '../ado/formatter.js';
import { auditTicketContract } from './evaluator.js';

export async function processWorkItemAudit(
  workItemId: number,
  revId: number
): Promise<void> {
  try {
    // Step 1: Fetch work item details from ADO
    const workItem = await getWorkItemDetails(workItemId);

    // Step 2: Only audit tickets in 'New' state
    if (workItem.state !== 'New') {
      db.update(dedupEvents)
        .set({
          status: 'skipped',
          errorMessage: `Ticket state is '${workItem.state}', expected 'New'`,
        })
        .where(
          and(
            eq(dedupEvents.workItemId, workItemId),
            eq(dedupEvents.revId, revId)
          )
        )
        .run();
      return;
    }

    // Step 3: Run L1 Definition of Done contract evaluation
    const result = await auditTicketContract({
      title: workItem.title,
      description: workItem.description,
      acceptanceCriteria: workItem.acceptanceCriteria,
    });

    // Step 4: Persist audit outcome in SQLite auditLogs table
    db.insert(auditLogs)
      .values({
        workItemId,
        revId,
        verdict: result.passed ? 'passed' : 'failed',
        reasons: JSON.stringify(result.reasons),
        criteriaSummary: result.criteria_summary,
        model: 'gpt-4o',
        evaluatedAt: new Date(),
      })
      .run();

    // Step 5 & 6: Format HTML comment and transition or post feedback
    const htmlComment = formatL1AuditComment(result);

    if (result.passed) {
      await transitionToReadyToDev(workItemId, htmlComment);
    } else {
      await postFeedbackComment(workItemId, htmlComment);
    }

    db.update(dedupEvents)
      .set({ status: 'completed' })
      .where(
        and(
          eq(dedupEvents.workItemId, workItemId),
          eq(dedupEvents.revId, revId)
        )
      )
      .run();
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
      `[auditor-worker] Failed processing audit for work item ${workItemId} rev ${revId}:`,
      err
    );
    throw err;
  }
}
// ponytail: synchronous in-process audit pipeline; decouple via persistent queue in v2
