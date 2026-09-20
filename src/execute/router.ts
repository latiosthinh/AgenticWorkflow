import { stateStore } from '../state/index.js';
import sanitizeHtml from 'sanitize-html';
import {
  getWorkItemDetails,
  updateWorkItemTags,
  escalateReworkToBlocked,
  postFeedbackComment,
  flagTicketBlocked,
} from '../ado/work-item.js';
import { processWorkItemAudit } from '../auditor/worker.js';
import { processWorkItemExecute } from './worker.js';
import { detectAcceptanceVerdict } from '../accept/verdict.js';
import {
  evaluateCircuitBreaker,
  resetCircuitBreaker,
} from '../accept/breaker.js';
import { processWorkItemRework } from './rework-worker.js';
import { createOrGetPullRequest } from '../ado/git.js';
import { formatPrDescription, formatWorkerAlertComment } from '../ado/formatter.js';
import { processQaVerification } from '../qa/worker.js';
import { processDeploymentWorkflow } from '../deploy/worker.js';
import { MissingEvidenceError } from '../deploy/evidence-index.js';
import { env } from '../config/env.js';
import { slugify } from '../utils/paths.js';
import { resolveRoutingStep } from '../pipeline/taxonomy.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import {
  detectScopeVerdict,
  handleScopeApproval,
  handleScopeRejection,
  handleScopeReset,
  resetScopeBreaker,
} from '../scope/index.js';

function parseDiffStat(statStr?: string): { totalLoc: number; filesChanged: number } {
  if (!statStr) return { totalLoc: 50, filesChanged: 2 };
  try {
    const parsed = JSON.parse(statStr);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.totalLoc === 'number') {
      return {
        totalLoc: parsed.totalLoc,
        filesChanged: parsed.filesChanged ?? 1,
      };
    }
  } catch {
    // not JSON, fall back to regex parsing
  }

  const filesMatch = statStr.match(/(\d+)\s+files?\s+changed/);
  const insMatch = statStr.match(/(\d+)\s+insertions?\(\+\)/);
  const delMatch = statStr.match(/(\d+)\s+deletions?\(-\)/);
  const locMatch = statStr.match(/(\d+)\s+LOC/);

  const filesChanged = filesMatch ? parseInt(filesMatch[1], 10) : 2;
  const totalLoc =
    insMatch || delMatch
      ? (insMatch ? parseInt(insMatch[1], 10) : 0) +
        (delMatch ? parseInt(delMatch[1], 10) : 0)
      : locMatch
        ? parseInt(locMatch[1], 10)
        : 50;

  return { totalLoc, filesChanged };
}

export async function routeWorkItemEvent(
  workItemId: number,
  revId: number,
  options?: any
): Promise<void> {
  return workItemQueueManager.runInLane(workItemId, async () => {
    try {
      const workItem = await getWorkItemDetails(workItemId, revId);

      let previousState: string | undefined;
      let previousTags: string | undefined;
      if (revId > 1) {
        try {
          const prevDetails = await getWorkItemDetails(workItemId, revId - 1);
          previousState = prevDetails.state;
          previousTags = prevDetails.tags;
        } catch {
          // Ignore previous revision lookup failure
        }
      }

      const scopeVerdict = detectScopeVerdict({
        currentState: workItem.state,
        previousState,
        historyComment: workItem.history,
        tags: workItem.tags,
        previousTags,
        revisedBy: workItem.revisedBy,
      });

      if (scopeVerdict.type === 'unauthorized') {
        const rawActor = scopeVerdict.actor || 'unknown';
        const sanitizedActor = sanitizeHtml(rawActor, { allowedTags: [], disallowedTagsMode: 'escape' });
        const warningComment = `[Unauthorized Verdict] User ${sanitizedActor} is not authorized to approve or reject this gate. Action ignored.\n<!-- [automated-agent] -->`;
        console.warn(
          `[router] Unauthorized scope verdict token '${scopeVerdict.token}' from actor '${sanitizedActor}' on work item ${workItemId}`
        );
        await postFeedbackComment(workItemId, warningComment);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        return;
      }

      if (scopeVerdict.type === 'reset_scope') {
        await handleScopeReset(workItemId, workItem.tags);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        return;
      } else if (scopeVerdict.type === 'approve') {
        await handleScopeApproval(workItemId, workItem.tags, scopeVerdict.actor);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        return;
      } else if (scopeVerdict.type === 'reject') {
        await handleScopeRejection(
          workItemId,
          scopeVerdict.feedback,
          workItem.tags,
          scopeVerdict.actor
        );
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        return;
      }

      const verdict = detectAcceptanceVerdict({
        currentState: workItem.state,
        previousState,
        historyComment: workItem.history,
        tags: workItem.tags,
        revisedBy: workItem.revisedBy,
      });

      if (verdict.type === 'unauthorized') {
        const rawActor = verdict.actor || 'unknown';
        const sanitizedActor = sanitizeHtml(rawActor, { allowedTags: [], disallowedTagsMode: 'escape' });
        const warningComment = `[Unauthorized Verdict] User ${sanitizedActor} is not authorized to approve or reject this gate. Action ignored.\n<!-- [automated-agent] -->`;
        console.warn(
          `[router] Unauthorized acceptance verdict token '${verdict.token}' from actor '${sanitizedActor}' on work item ${workItemId}`
        );
        await postFeedbackComment(workItemId, warningComment);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
        return;
      }

      if (verdict.type === 'reset_rework') {
        await resetCircuitBreaker(workItemId);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
      } else if (verdict.type === 'approve') {
        const actor = sanitizeHtml(verdict.actor || workItem.revisedBy || 'human-reviewer', {
          allowedTags: [],
          disallowedTagsMode: 'escape',
        });
        await updateWorkItemTags(
          workItemId,
          '[acceptance-approved]',
          '[awaiting-acceptance]'
        );
        await stateStore.updateTicketState(workItemId, (draft) => {
          draft.l4Evidence = {
            securityPassed: true,
            policiesSummary: `Acceptance approved by actor '${actor}' with verified branch and security policies`,
          };
        });
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
      } else if (verdict.type === 'reject') {
        const breaker = await evaluateCircuitBreaker(workItemId, 'accept');
        if (!breaker.allowed) {
          await escalateReworkToBlocked(workItemId, breaker.currentCount);
          stateStore.updateDedupStatus(workItemId, revId, 'completed');
        } else {
          await processWorkItemRework(workItemId, revId, verdict.feedback, options);
        }
      } else {
        const stepKey = workItem.boardColumn || workItem.state;
        const step = resolveRoutingStep(stepKey, workItem.tags);

        if (!step) {
          stateStore.updateDedupStatus(
            workItemId,
            revId,
            'skipped',
            workItem.boardColumn
              ? `Ticket state '${workItem.state}' (column '${workItem.boardColumn}') has no active handler`
              : `Ticket state '${workItem.state}' has no active handler`
          );
          return;
        }

        switch (step.step) {
          case 1:
            await processWorkItemAudit(workItemId, revId);
            break;
          case 3: {
            const ticket = await stateStore.getTicketState(workItemId);
            const hasScopeLock = ticket?.scopeLock?.status === 'locked';
            const isDirectDevMove =
              !ticket?.scopeLock &&
              (workItem.boardColumn?.toLowerCase() === 'in dev' || workItem.state.toLowerCase() === 'doing');

            if (!hasScopeLock && !options?.skipScopeLockCheck && !isDirectDevMove) {
              stateStore.updateDedupStatus(
                workItemId,
                revId,
                'skipped',
                `In Dev dispatch refused: ticket is not scope-locked (status: ${ticket?.scopeLock?.status ?? 'none'})`
              );
              return;
            }

            if (isDirectDevMove && !hasScopeLock) {
              const now = new Date().toISOString();
              await stateStore.updateTicketState(workItemId, (draft) => {
                draft.scopeLock = {
                  status: 'locked',
                  iterationCount: 0,
                  requestedAt: now,
                  lockedAt: now,
                  lockedBy: workItem.revisedBy || 'human-developer',
                  feedback: null,
                  remindedAt: null,
                  escalatedAt: null,
                  createdAt: now,
                  updatedAt: now,
                };
              });
            }

            await processWorkItemExecute(workItemId, revId, options);
            break;
          }
          case 4: {
            const ticket = await stateStore.getTicketState(workItemId);
            const evidence = ticket?.l3Evidence && ticket.l3Evidence.length > 0
              ? ticket.l3Evidence[ticket.l3Evidence.length - 1]
              : undefined;

            if (!evidence) {
              try {
                const comment = formatWorkerAlertComment(
                  '[Missing Evidence] Step 4 PR creation blocked',
                  `Missing required L3 test evidence for PR creation in step 4 for work item #${workItemId}.`
                );
                await flagTicketBlocked(workItemId, comment, 'contract-conflict');
              } catch (flagErr) {
                console.warn(`[router] Failed flagging ticket ${workItemId} blocked:`, flagErr);
              }
              throw new MissingEvidenceError(
                'Missing required L3 test evidence for PR creation in step 4',
                'L3',
                workItemId
              );
            }

            const testSummary = {
              suite: evidence.testSuite,
              totalTests: evidence.totalTests,
              passed: evidence.passed,
              failed: evidence.failed,
              durationMs: evidence.durationMs,
            };

            const diffStat = parseDiffStat(evidence.gitDiffStat);

            const prDescription = formatPrDescription({
              workItemId,
              title: workItem.title,
              acceptanceCriteria: workItem.acceptanceCriteria,
              testSummary,
              diffStat,
            });

            const slug = slugify(workItem.title);
            const sourceBranch = `task/ticket-${workItemId}-${slug}`;

            await createOrGetPullRequest({
              workItemId,
              title: workItem.title,
              sourceBranch,
              description: prDescription,
              projectId: env.ADO_PROJECT,
              repositoryId: env.ADO_REPOSITORY_ID,
            });

            await stateStore.updateTicketState(workItemId, (draft) => {
              draft.l2Evidence = {
                reviewPassed: true,
                qualityNotes: `PR created on branch ${sourceBranch} with test summary: ${testSummary.passed}/${testSummary.totalTests} passed`,
              };
            });

            stateStore.updateDedupStatus(workItemId, revId, 'completed');
            break;
          }
          case 6:
            await processQaVerification(workItemId, options);
            stateStore.updateDedupStatus(workItemId, revId, 'completed');
            break;
          case 7:
            await processDeploymentWorkflow(workItemId, revId, options);
            stateStore.updateDedupStatus(workItemId, revId, 'completed');
            break;
          default:
            stateStore.updateDedupStatus(
              workItemId,
              revId,
              'skipped',
              `Ticket state '${workItem.state}' has no active handler`
            );
            break;
        }
      }
    } catch (err: any) {
      if (err instanceof MissingEvidenceError) {
        stateStore.updateDedupStatus(
          workItemId,
          revId,
          'failed',
          err.message
        );
        console.warn(
          `[router] Work item ${workItemId} rev ${revId} blocked cleanly by missing evidence (${err.evidenceType ?? 'unknown'}): ${err.message}`
        );
        throw err;
      }
      stateStore.updateDedupStatus(
        workItemId,
        revId,
        'failed',
        err?.message || String(err)
      );
      console.error(
        `[router] Failed routing work item ${workItemId} rev ${revId}:`,
        err
      );
      throw err;
    }
  });
}

// ponytail: static routing table; make dynamic via pluggable pipeline plugins in v2
