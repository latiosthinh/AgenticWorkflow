import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { adoClient } from '../ado/client.js';
import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { buildTagPatch } from '../ado/work-item.js';

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

export async function checkScopeLockTimeouts(): Promise<{
  reminded: number;
  escalated: number;
  reconciled: number;
}> {
  let reminded = 0;
  let escalated = 0;
  let reconciled = 0;

  const tickets = await stateStore.listTickets();

  for (const ticket of tickets) {
    if (ticket.scopeLock?.status !== 'pending') {
      continue;
    }

    try {
      // Reconcile with live ADO state in case webhook was dropped
      const workItem = await adoClient.getWorkItem(ticket.workItemId);
      const state = workItem.fields?.['System.State'];
      const tags = workItem.fields?.['System.Tags'] || '';

      if (state === 'Ready to Dev' || tags.includes('[scope-locked]')) {
        // Human already approved in ADO: reconcile StateStore
        await workItemQueueManager.runInLane(ticket.workItemId, async () => {
          await stateStore.updateTicketState(ticket.workItemId, (draft) => {
            if (draft.scopeLock && draft.scopeLock.status === 'pending') {
              draft.scopeLock.status = 'locked';
              draft.scopeLock.lockedAt = new Date().toISOString();
              draft.scopeLock.updatedAt = new Date().toISOString();
            }
          });
        });
        reconciled++;
        continue;
      }

      const requestedAt = new Date(ticket.scopeLock.requestedAt).getTime();
      const elapsed = Date.now() - requestedAt;

      if (elapsed >= SEVENTY_TWO_HOURS_MS && !ticket.scopeLock.escalatedAt) {
        const escalationComment =
          '<strong>[Scope Review Escalation] Work Item Blocked</strong><p>Scope review has been pending for over 72 hours without PM verdict. Marking work item Blocked.</p><!-- [automated-agent] -->';

        await workItemQueueManager.runInLane(ticket.workItemId, async () => {
          const current = await stateStore.getTicketState(ticket.workItemId);
          if (!current?.scopeLock || current.scopeLock.status !== 'pending' || current.scopeLock.escalatedAt) {
            return;
          }

          const tagPatches = buildTagPatch(tags, '[scope-unresolved]', '[awaiting-scope-lock]');
          await adoClient.updateWorkItem(ticket.workItemId, [
            ...tagPatches,
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

          await stateStore.updateTicketState(ticket.workItemId, (draft) => {
            if (draft.scopeLock && draft.scopeLock.status === 'pending') {
              draft.scopeLock.status = 'blocked';
              draft.scopeLock.escalatedAt = new Date().toISOString();
              draft.scopeLock.updatedAt = new Date().toISOString();
            }
          });
          escalated++;
        });
      } else if (elapsed >= TWENTY_FOUR_HOURS_MS && !ticket.scopeLock.remindedAt) {
        const reminderComment =
          '<strong>[Scope Review Reminder] Action Required</strong><p>Work item is awaiting PM scope lock. Please review acceptance criteria and approve or request changes.</p><!-- [automated-agent] -->';

        await workItemQueueManager.runInLane(ticket.workItemId, async () => {
          const current = await stateStore.getTicketState(ticket.workItemId);
          if (!current?.scopeLock || current.scopeLock.status !== 'pending' || current.scopeLock.remindedAt) {
            return;
          }

          await adoClient.updateWorkItem(ticket.workItemId, [
            {
              op: Operation.Add,
              path: '/fields/System.History',
              value: reminderComment,
            },
          ]);

          await stateStore.updateTicketState(ticket.workItemId, (draft) => {
            if (draft.scopeLock && draft.scopeLock.status === 'pending') {
              draft.scopeLock.remindedAt = new Date().toISOString();
              draft.scopeLock.updatedAt = new Date().toISOString();
            }
          });
          reminded++;
        });
      }
    } catch (itemErr) {
      console.error(`[scope-watchdog] Error processing ticket ${ticket.workItemId}:`, itemErr);
    }
  }

  return { reminded, escalated, reconciled };
}

export function startScopeWatchdog(
  intervalMs = 60 * 60 * 1000
): { stop: () => void } {
  let running = true;

  const timer = setInterval(async () => {
    if (!running) return;
    try {
      await checkScopeLockTimeouts();
    } catch (err) {
      console.error('[scope-watchdog] Error checking timeouts:', err);
    }
  }, intervalMs);

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}

// ponytail: periodic batch scanner; upgrade to event-driven timers in v2
