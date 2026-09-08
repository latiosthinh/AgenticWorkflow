import { spawn, ChildProcess } from 'node:child_process';
import { env } from '../config/env.js';

export const WIQL_NEW_WORK_ITEMS = "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'New' ORDER BY [System.ChangedDate] DESC";

export function startTunnel(port = env.PORT): ChildProcess {
  const tunnelUrl = `http://localhost:${port}`;
  const process = spawn('cloudflared', ['tunnel', '--url', tunnelUrl], {
    stdio: 'inherit',
    shell: true,
  });

  process.on('error', (err) => {
    console.error('Failed to spawn cloudflared tunnel:', err);
  });

  return process;
}

export interface PollerOptions {
  intervalMs?: number;
  onPoll?: (wiql: string) => Promise<void> | void;
}

export function startPolling(options: PollerOptions = {}): { stop: () => void } {
  const intervalMs = options.intervalMs ?? 15000;
  let running = true;

  const timer = setInterval(async () => {
    if (!running) return;
    try {
      if (options.onPoll) {
        await options.onPoll(WIQL_NEW_WORK_ITEMS);
      }
    } catch (err) {
      console.error('Polling error:', err);
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
    console.log('Starting ADO WIQL polling fallback listener...');
    startPolling({
      onPoll: (wiql) => {
        console.log(`Polling ADO with query: ${wiql}`);
      },
    });
  } else {
    console.log('Local ingress helper: use --tunnel or --poll');
  }
}

if (process.argv[1] && (process.argv[1].endsWith('poller.ts') || process.argv[1].endsWith('poller.js'))) {
  runLocalIngressHelper();
}
