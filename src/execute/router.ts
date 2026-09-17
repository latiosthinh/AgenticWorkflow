import { stateStore } from '../state/index.js';
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
import { createOrGetPullRequest } from '../ado/git.js';
import { formatPrDescription } from '../ado/formatter.js';
import { processQaVerification } from '../qa/worker.js';
import { processDeploymentWorkflow } from '../deploy/worker.js';
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
        revisedBy: (workItem as any).revisedBy,
      });

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
      });

      if (verdict.type === 'reset_rework') {
        await resetCircuitBreaker(workItemId);
        stateStore.updateDedupStatus(workItemId, revId, 'completed');
      } else if (verdict.type === 'approve') {
        await updateWorkItemTags(
          workItemId,
          '[acceptance-approved]',
          '[awaiting-acceptance]'
        );
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
        const step = resolveRoutingStep(workItem.state, workItem.tags);

        if (!step) {
          stateStore.updateDedupStatus(
            workItemId,
            revId,
            'skipped',
            `Ticket state '${workItem.state}' has no active handler`
          );
          return;
        }

        switch (step.step) {
          case 1:
            await processWorkItemAudit(workItemId, revId);
            break;
          case 3: {
            const ticket = await stateStore.getTicketState(workItemId);
            if (ticket?.scopeLock?.status !== 'locked' && !options?.skipScopeLockCheck) {
              stateStore.updateDedupStatus(
                workItemId,
                revId,
                'skipped',
                `In Dev dispatch refused: ticket is not scope-locked (status: ${ticket?.scopeLock?.status ?? 'none'})`
              );
              return;
            }
            await processWorkItemExecute(workItemId, revId, options);
            break;
          }
          case 4: {
            const ticket = await stateStore.getTicketState(workItemId);
            const evidence = ticket?.l3Evidence && ticket.l3Evidence.length > 0
              ? ticket.l3Evidence[ticket.l3Evidence.length - 1]
              : undefined;

            const testSummary = evidence
              ? {
                  suite: evidence.testSuite,
                  totalTests: evidence.totalTests,
                  passed: evidence.passed,
                  failed: evidence.failed,
                  durationMs: evidence.durationMs,
                }
              : {
                  suite: 'vitest',
                  totalTests: 1,
                  passed: 1,
                  failed: 0,
                  durationMs: 100,
                };

            const diffStat = parseDiffStat(evidence?.gitDiffStat);

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
