import Fastify, { FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { webhookRoutes, registerWorkItemHandler } from './ingress/routes.js';
import { routeWorkItemEvent } from './execute/router.js';
import { startPlanWatchdog } from './plan/watchdog.js';
import { startScopeWatchdog } from './scope/index.js';
import { startPolling } from './ingress/poller.js';
import { purgeOldDedupEvents } from './state/index.js';
import { workItemQueueManager } from './queue/lane-manager.js';
import { pruneOrphanedWorktrees } from './sandbox/worktree.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  await app.register(fastifyRawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });

  await app.register(sensible);

  registerWorkItemHandler(routeWorkItemEvent);
  await app.register(webhookRoutes);

  return app;
}

export async function startServer(): Promise<{ app: FastifyInstance; stop: () => Promise<void> }> {
  // Startup worktree prune
  try {
    const prunedWorktrees = await pruneOrphanedWorktrees(process.cwd());
    console.log(`[worktree-prune] Startup sweep cleaned ${prunedWorktrees} orphaned worktrees`);
  } catch (err) {
    console.error('[worktree-prune] Startup sweep failed:', err);
  }

  // Startup deduplication purge
  try {
    const purgeResult = purgeOldDedupEvents(7);
    console.log(`[dedup-purge] Initial purge removed ${purgeResult.changes} expired events`);
  } catch (err) {
    console.error('[dedup-purge] Initial purge failed:', err);
  }

  // Daily interval for TTL cleanup
  const purgeInterval = setInterval(() => {
    try {
      const res = purgeOldDedupEvents(7);
      console.log(`[dedup-purge] Daily purge removed ${res.changes} expired events`);
    } catch (err) {
      console.error('[dedup-purge] Daily purge failed:', err);
    }
  }, 24 * 60 * 60 * 1000);

  const watchdog = startPlanWatchdog();
  const scopeWatchdog = startScopeWatchdog();
  const poller = env.ENABLE_ADO_POLLING && env.NODE_ENV !== 'test'
    ? startPolling({ intervalMs: env.ADO_POLLING_INTERVAL_MS })
    : null;

  const app = await buildApp();

  let isShuttingDown = false;
  async function gracefulShutdown(signal?: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    if (signal) {
      console.log(`[shutdown] Received ${signal}, starting graceful shutdown...`);
    }

    clearInterval(purgeInterval);
    poller?.stop();
    watchdog.stop();
    scopeWatchdog.stop();

    try {
      await app.close();
      console.log('[shutdown] Fastify server closed.');

      await workItemQueueManager.drainAll();
      console.log('[shutdown] Work item queue lanes drained.');

      if (signal) {
        process.exit(0);
      }
    } catch (err) {
      console.error('[shutdown] Error during graceful shutdown:', err);
      if (signal) {
        process.exit(1);
      }
      throw err;
    }
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  console.log(`Server listening on port ${env.PORT}`);

  return {
    app,
    stop: () => gracefulShutdown(),
  };
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal server bootstrap error:', err);
    process.exit(1);
  });
}
// ponytail: single process fastify gateway; containerize for k8s deployment in v2
