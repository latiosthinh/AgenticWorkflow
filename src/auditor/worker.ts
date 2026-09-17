import {
  getWorkItemDetails,
  transitionToReadyToDev,
  postFeedbackComment,
} from '../ado/work-item.js';
import { formatL1AuditComment } from '../ado/formatter.js';
import { auditTicketContract } from './evaluator.js';
import { stateStore } from '../state/index.js';

export async function processWorkItemAudit(
  workItemId: number,
  revId: number
): Promise<void> {
  try {
    // Step 1: Fetch work item details from ADO
    const workItem = await getWorkItemDetails(workItemId);

    // Step 2: Only audit tickets in 'New' state
    if (workItem.state !== 'New') {
      stateStore.updateDedupStatus(
        workItemId,
        revId,
        'skipped',
        `Ticket state is '${workItem.state}', expected 'New'`
      );
      return;
    }

    // Step 3: Run L1 Definition of Done contract evaluation
    const result = await auditTicketContract({
      title: workItem.title,
      description: workItem.description,
      acceptanceCriteria: workItem.acceptanceCriteria,
    });

    // Step 4: Persist audit outcome via stateStore.updateTicketState
    await stateStore.updateTicketState(
      workItemId,
      (draft) => {
        draft.revId = revId;
        draft.auditLogs.push({
          revId,
          verdict: result.passed ? 'passed' : 'failed',
          reasons: JSON.stringify(result.reasons),
          criteriaSummary: result.criteria_summary,
          model: 'gpt-4o',
          evaluatedAt: new Date().toISOString(),
        });
      },
      `## L1 Audit Verdict: ${result.passed ? 'PASSED' : 'FAILED'}\n${result.criteria_summary}`
    );

    // Step 5 & 6: Format HTML comment and transition or post feedback
    const htmlComment = formatL1AuditComment(result);

    if (result.passed) {
      await transitionToReadyToDev(workItemId, htmlComment);
    } else {
      await postFeedbackComment(workItemId, htmlComment);
    }

    stateStore.updateDedupStatus(workItemId, revId, 'completed');
  } catch (err: any) {
    stateStore.updateDedupStatus(workItemId, revId, 'failed', err?.message || String(err));
    console.error(
      `[auditor-worker] Failed processing audit for work item ${workItemId} rev ${revId}:`,
      err
    );
    throw err;
  }
}
// ponytail: synchronous in-process audit pipeline; decouple via persistent queue in v2
