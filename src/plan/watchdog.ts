import { eq } from 'drizzle-orm';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { db } from '../db/index.js';
import { planCheckpoints } from '../db/schema.js';
import { adoClient } from '../ado/client.js';

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

export async function checkPlanCheckpointTimeouts(): Promise<{
  reminded: number;
  escalated: number;
}> {
  let reminded = 0;
  let escalated = 0;

  const pending = db
    .select()
    .from(planCheckpoints)
    .where(eq(planCheckpoints.status, 'pending_human_input'))
    .all();

  for (const cp of pending) {
    try {
      const createdAt =
        cp.createdAt instanceof Date
          ? cp.createdAt.getTime()
          : new Date(cp.createdAt).getTime();
      const elapsed = Date.now() - createdAt;

      if (elapsed >= SEVENTY_TWO_HOURS_MS && !cp.escalatedAt) {
        const escalationComment =
          '<strong>[Plan Checkpoint] Escalation: Work Item Blocked</strong><p>Clarification questions have been unanswered for over 72 hours. Marking work item Blocked.</p><!-- [automated-agent] -->';

        await adoClient.updateWorkItem(cp.workItemId, [
          {
            op: Operation.Replace,
            path: '/fields/System.State',
            value: 'Blocked',
          },
          {
            op: Operation.Add,
            path: '/fields/System.History',
            value: escalationComment,
          },
        ]);

        db.update(planCheckpoints)
          .set({
            status: 'blocked',
            escalatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(planCheckpoints.id, cp.id))
          .run();

        escalated++;
      } else if (elapsed >= TWENTY_FOUR_HOURS_MS && !cp.remindedAt) {
        const reminderComment =
          '<strong>[Plan Reminder] Action Required: Unanswered Questions</strong><p>The implementation plan is awaiting developer reply. Please respond to the questions above to resume work.</p><!-- [automated-agent] -->';

        await adoClient.updateWorkItem(cp.workItemId, [
          {
            op: Operation.Add,
            path: '/fields/System.History',
            value: reminderComment,
          },
        ]);

        db.update(planCheckpoints)
          .set({
            remindedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(planCheckpoints.id, cp.id))
          .run();

        reminded++;
      }
    } catch (itemErr) {
      console.error(
        `[plan-watchdog] Failed updating timeout for checkpoint ${cp.id} (ticket ${cp.workItemId}):`,
        itemErr
      );
    }
  }

  return { reminded, escalated };
}

export function startPlanWatchdog(
  intervalMs = 60 * 60 * 1000
): { stop: () => void } {
  let running = true;

  const timer = setInterval(async () => {
    if (!running) return;
    try {
      await checkPlanCheckpointTimeouts();
    } catch (err) {
      console.error('[plan-watchdog] Error checking timeouts:', err);
    }
  }, intervalMs);

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}
