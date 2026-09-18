import { spawn, ChildProcess } from 'node:child_process';
import { env } from '../config/env.js';
import { adoClient } from '../ado/client.js';
import { stateStore } from '../state/index.js';
import { routeWorkItemEvent } from '../execute/router.js';
import { workItemQueueManager } from '../queue/lane-manager.js';

export const WIQL_NEW_WORK_ITEMS = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${env.ADO_PROJECT}' ORDER BY [System.ChangedDate] DESC`;

export function startTunnel(port: number = env.PORT): ChildProcess {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  const tunnelUrl = `http://localhost:${port}`;
  const process = spawn('cloudflared', ['tunnel', '--url', tunnelUrl], {
    stdio: 'inherit',
    shell: false,
  });

  process.on('error', (err) => {
    console.error('Failed to spawn cloudflared tunnel:', err);
  });

  return process;
}

export async function pollAdoWorkItems(): Promise<number> {
  if (!env.ADO_PROJECT || env.ADO_PROJECT === 'default-project') {
    return 0;
  }

  try {
    const witApi = await adoClient.getWorkItemTrackingApi();
    const query = `
      SELECT [System.Id], [System.Rev]
      FROM WorkItems
      WHERE [System.TeamProject] = '${env.ADO_PROJECT}'
      ORDER BY [System.ChangedDate] DESC
    `;

    const result = await witApi.queryByWiql({ query });
    const items = result.workItems || [];
    let dispatched = 0;

    for (const item of items) {
      if (!item.id) continue;
      try {
        const details = await witApi.getWorkItem(item.id);
        const revId = details.rev || 1;
        const payloadHash = `poll-${item.id}-${revId}`;

        const { isDuplicate } = stateStore.recordDedupEvent(item.id, revId, payloadHash);
        if (!isDuplicate) {
          dispatched++;
          const state = details.fields?.['System.State'];
          console.log(`[ado-poller] Detected new/modified work item #${item.id} rev ${revId} (State: ${state})`);
          workItemQueueManager.runInLane(item.id, async () => {
            try {
              await routeWorkItemEvent(item.id!, revId);
              stateStore.updateDedupStatus(item.id!, revId, 'completed');
            } catch (err: any) {
              console.error(`[ado-poller] Processing work item #${item.id} failed:`, err?.message || err);
              stateStore.updateDedupStatus(item.id!, revId, 'failed', err?.message || String(err));
            }
          });
        }
      } catch (itemErr: any) {
        console.warn(`[ado-poller] Failed checking details for item #${item.id}:`, itemErr?.message || itemErr);
      }
    }
    return dispatched;
  } catch (err: any) {
    console.error('[ado-poller] Polling query failed:', err?.message || err);
    return 0;
  }
}

export interface PollerOptions {
  intervalMs?: number;
  onPoll?: (wiql: string) => Promise<void> | void;
}

export function startPolling(options: PollerOptions = {}): { stop: () => void } {
  const intervalMs = options.intervalMs ?? env.ADO_POLLING_INTERVAL_MS ?? 10_000;
  let running = true;
  let isTickRunning = false;

  const timer = setInterval(async () => {
    if (!running || isTickRunning) return;
    isTickRunning = true;
    try {
      if (options.onPoll) {
        await options.onPoll(WIQL_NEW_WORK_ITEMS);
      } else {
        await pollAdoWorkItems();
      }
    } catch (err) {
      console.error('[ado-poller] Interval error:', err);
    } finally {
      isTickRunning = false;
    }
  }, intervalMs);

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}

export function runLocalIngressHelper() {
  const args = process.argv.slice(2);
  const useTunnel = args.includes('--tunnel');
  const usePoll = args.includes('--poll');

  if (useTunnel) {
    console.log(`Starting cloudflared tunnel to http://localhost:${env.PORT}...`);
    startTunnel(env.PORT);
  } else if (usePoll) {
    console.log(`Starting ADO polling listener for project '${env.ADO_PROJECT}'...`);
    startPolling();
  } else {
    console.log('Local ingress helper: use --tunnel or --poll');
  }
}

if (process.argv[1] && (process.argv[1].endsWith('poller.ts') || process.argv[1].endsWith('poller.js'))) {
  runLocalIngressHelper();
}
