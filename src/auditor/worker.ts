import {
  getWorkItemDetails,
  postFeedbackComment,
} from '../ado/work-item.js';
import { adoClient } from '../ado/client.js';
import { formatL1AuditComment } from '../ado/formatter.js';
import { auditTicketContract } from './evaluator.js';
import { stateStore } from '../state/index.js';
import {
  formatScopeReviewPacketComment,
  buildParkScopeLockPatch,
} from '../scope/packet.js';

export async function processWorkItemAudit(
  workItemId: number,
  revId: number
): Promise<void> {
  try {
    // Step 1: Fetch work item details from ADO
    const workItem = await getWorkItemDetails(workItemId);

    // Step 2: Only audit tickets in 'New' state / 'To Do' column
    const isRefinementFlow =
      workItem.boardColumn?.toLowerCase() === 'to do' ||
      ['new', 'to do', 'proposed'].includes(workItem.state.toLowerCase());

    if (!isRefinementFlow) {
      stateStore.updateDedupStatus(
        workItemId,
        revId,
        'skipped',
        `Ticket state is '${workItem.state}', expected 'New'`
      );
      return;
    }

    const ticketState = await stateStore.getTicketState(workItemId);
    const isParkedAwaiting =
      workItem.tags?.includes('[awaiting-scope-lock]') ||
      ticketState?.scopeLock?.status === 'pending';
    const isAlreadyLocked =
      workItem.tags?.includes('[scope-locked]') ||
      ticketState?.scopeLock?.status === 'locked';

    if (isParkedAwaiting || isAlreadyLocked) {
      stateStore.updateDedupStatus(
        workItemId,
        revId,
        'skipped',
        `Work item ${workItemId} is parked awaiting scope lock or already locked; skipping re-audit`
      );
      return;
    }

    // Step 3: Run L1 Definition of Done contract evaluation
    const result = await auditTicketContract({
      title: workItem.title,
      description: workItem.description,
      acceptanceCriteria: workItem.acceptanceCriteria,
    });

    // Step 4 & 5: Format comment, update ADO, and atomically persist StateStore
    if (result.passed) {
      const packetHtml = formatScopeReviewPacketComment({
        workItemId,
        title: workItem.title,
        criteriaSummary: result.criteria_summary,
        reasons: result.reasons,
      });

      const patchDoc = buildParkScopeLockPatch(packetHtml, workItem.tags);
      await adoClient.updateWorkItem(workItemId, patchDoc);

      const now = new Date().toISOString();
      await stateStore.updateTicketState(
        workItemId,
        (draft) => {
          draft.revId = revId;
          draft.auditLogs.push({
            revId,
            verdict: 'passed',
            reasons: JSON.stringify(result.reasons),
            criteriaSummary: result.criteria_summary,
            model: 'gpt-4o',
            evaluatedAt: now,
          });
          draft.scopeLock = {
            status: 'pending',
            iterationCount: 0,
            requestedAt: now,
            lockedAt: null,
            lockedBy: null,
            feedback: null,
            remindedAt: null,
            escalatedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        },
        `## L1 Audit Verdict: PASSED\n${result.criteria_summary}`
      );
    } else {
      const htmlComment = formatL1AuditComment(result);
      await postFeedbackComment(workItemId, htmlComment);

      const now = new Date().toISOString();
      await stateStore.updateTicketState(
        workItemId,
        (draft) => {
          draft.revId = revId;
          draft.auditLogs.push({
            revId,
            verdict: 'failed',
            reasons: JSON.stringify(result.reasons),
            criteriaSummary: result.criteria_summary,
            model: 'gpt-4o',
            evaluatedAt: now,
          });
        },
        `## L1 Audit Verdict: FAILED\n${result.criteria_summary}`
      );
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
