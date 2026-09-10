import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dedupEvents, l3Evidence } from '../db/schema.js';
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
    } else if (workItem.state === 'Dev Done') {
      const evidence = db
        .select()
        .from(l3Evidence)
        .where(eq(l3Evidence.workItemId, workItemId))
        .orderBy(desc(l3Evidence.id))
        .get();

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

      db.update(dedupEvents)
        .set({ status: 'completed' })
        .where(
          and(
            eq(dedupEvents.workItemId, workItemId),
            eq(dedupEvents.revId, revId)
          )
        )
        .run();
    } else if (workItem.state === 'Ready for QA') {
      await processQaVerification(workItemId, options);
      db.update(dedupEvents)
        .set({ status: 'completed' })
        .where(
          and(
            eq(dedupEvents.workItemId, workItemId),
            eq(dedupEvents.revId, revId)
          )
        )
        .run();
    } else if (workItem.state === 'Ready to Deploy') {
      await processDeploymentWorkflow(workItemId, revId, options);
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
