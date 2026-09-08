import { eq, and } from 'drizzle-orm';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { db } from '../db/index.js';
import { dedupEvents } from '../db/schema.js';
import {
  getWorkItemDetails,
  buildPlanQuestionPatch,
  buildPlanLockedPatch,
} from '../ado/work-item.js';
import { adoClient } from '../ado/client.js';
import { createWorktree, cleanupWorktree } from '../sandbox/worktree.js';
import { createDynamicMcpTools } from '../mcp/registry.js';
import { formulateImplementationPlan } from '../plan/planner.js';
import {
  createPlanCheckpoint,
  getPendingCheckpoint,
  lockPlanCheckpoint,
  updateCheckpointStatus,
} from '../plan/checkpoint.js';
import {
  formatPlanQuestionsComment,
  formatPlanLockedComment,
} from '../plan/formatter.js';

export async function processWorkItemExecute(
  workItemId: number,
  revId: number
): Promise<void> {
  try {
    // Step 1: Fetch work item details
    const workItem = await getWorkItemDetails(workItemId, revId);

    // Step 2: Check for Resumption Flow
    const isAwaitingInput = workItem.tags?.includes('[awaiting-input]');
    const pendingCheckpoint = await getPendingCheckpoint(workItemId);

    if (isAwaitingInput && pendingCheckpoint) {
      const history = workItem.history?.trim();
      const isNonBot =
        typeof history === 'string' &&
        history.length > 0 &&
        !history.includes('<!-- [automated-agent] -->') &&
        !history.startsWith('### [Plan Q&A]') &&
        !history.startsWith('### [Plan Q&amp;A]') &&
        !history.startsWith('<h3>[Plan Q&A]') &&
        !history.startsWith('<h3>[Plan Q&amp;A]');

      if (isNonBot && typeof history === 'string') {
        let estimatedFiles: string[] = [];
        try {
          estimatedFiles = JSON.parse(pendingCheckpoint.estimatedFiles || '[]');
        } catch {
          estimatedFiles = [];
        }

        const lockedPlanMarkdown =
          pendingCheckpoint.planMarkdown ||
          'Implementation plan locked with developer clarifications.';

        await lockPlanCheckpoint(pendingCheckpoint.id, history);

        const lockedComment = formatPlanLockedComment(
          lockedPlanMarkdown,
          estimatedFiles
        );

        const patchDoc = buildPlanLockedPatch(lockedComment, workItem.tags);
        await adoClient.updateWorkItem(workItemId, patchDoc);

        db.update(dedupEvents)
          .set({ status: 'completed' })
          .where(
            and(
              eq(dedupEvents.workItemId, workItemId),
              eq(dedupEvents.revId, revId)
            )
          )
          .run();

        console.log(
          `Plan locked for ticket ${workItemId} with developer answers. Ready for Phase 3 implementation.`
        );
        return;
      } else {
        db.update(dedupEvents)
          .set({
            status: 'skipped',
            errorMessage: 'Work item awaiting input; awaiting human developer reply',
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
    }

    // Step 3: Fresh 'In Dev' Execution Flow
    if (workItem.state !== 'In Dev') {
      db.update(dedupEvents)
        .set({
          status: 'skipped',
          errorMessage: `Ticket state is '${workItem.state}', expected 'In Dev'`,
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

    let worktreeResult: { worktreePath: string; branchName: string } | undefined;
    let mcpSession: { close: () => Promise<void> } | undefined;

    try {
      // Provision ephemeral git worktree
      worktreeResult = await createWorktree(
        process.cwd(),
        workItemId,
        workItem.title
      );

      // Resolve dynamic MCP tools
      const tags = (workItem.tags || '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean);

      mcpSession = await createDynamicMcpTools({
        worktreePath: worktreeResult.worktreePath,
        tags,
      });

      // Formulate implementation plan
      const plan = await formulateImplementationPlan({
        title: workItem.title,
        description: workItem.description,
        acceptanceCriteria: workItem.acceptanceCriteria,
        tags,
      });

      if (plan.hasAmbiguities) {
        await createPlanCheckpoint({
          workItemId,
          revId,
          questions: plan.questions,
          planMarkdown: plan.planMarkdown,
          estimatedFiles: plan.estimatedFiles,
          testStrategy: plan.testStrategy,
        });

        const comment = formatPlanQuestionsComment(plan.questions);
        const patchDoc = buildPlanQuestionPatch(comment, workItem.tags);
        await adoClient.updateWorkItem(workItemId, patchDoc);

        // IMMEDIATELY release worktree per locked decision
        await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
        worktreeResult = undefined;

        await mcpSession.close();
        mcpSession = undefined;

        db.update(dedupEvents)
          .set({ status: 'completed' })
          .where(
            and(
              eq(dedupEvents.workItemId, workItemId),
              eq(dedupEvents.revId, revId)
            )
          )
          .run();
        return;
      } else {
        const cp = await createPlanCheckpoint({
          workItemId,
          revId,
          questions: plan.questions,
          planMarkdown: plan.planMarkdown,
          estimatedFiles: plan.estimatedFiles,
          testStrategy: plan.testStrategy,
        });
        await updateCheckpointStatus(cp.id, 'locked');

        const comment = formatPlanLockedComment(
          plan.planMarkdown,
          plan.estimatedFiles
        );

        await adoClient.updateWorkItem(workItemId, [
          {
            op: Operation.Add,
            path: '/fields/System.History',
            value: comment,
          },
        ]);

        await mcpSession.close();
        mcpSession = undefined;

        if (worktreeResult) {
          await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
          worktreeResult = undefined;
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
        return;
      }
    } catch (innerErr: any) {
      if (worktreeResult) {
        await cleanupWorktree(process.cwd(), worktreeResult.worktreePath).catch(
          () => {}
        );
      }
      if (mcpSession) {
        await mcpSession.close().catch(() => {});
      }
      throw innerErr;
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
      `[execute-worker] Failed processing execution for work item ${workItemId} rev ${revId}:`,
      err
    );
    throw err;
  }
}

// ponytail: synchronous in-process execute pipeline; decouple via persistent queue in v2
