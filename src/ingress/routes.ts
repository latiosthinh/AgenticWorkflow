import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { verifyHmac } from './hmac.js';
import { isBotEcho } from './bot-shield.js';
import { db } from '../db/index.js';
import { dedupEvents } from '../db/schema.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { env } from '../config/env.js';
import { processWorkItemAudit } from '../auditor/worker.js';
import { handlePullRequestEvent, extractWorkItemId } from './pr-router.js';

export type WorkItemHandler = (workItemId: number, revId: number) => Promise<void>;
export type PullRequestHandler = (payload: any) => Promise<void>;

let activeHandler: WorkItemHandler | undefined = processWorkItemAudit;
let activePrHandler: PullRequestHandler | undefined = handlePullRequestEvent;

export function registerWorkItemHandler(handler: WorkItemHandler | undefined) {
  activeHandler = handler;
}

export function registerPullRequestHandler(handler: PullRequestHandler | undefined) {
  activePrHandler = handler;
}

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post('/api/ado/webhook', {
    config: { rawBody: true },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody = (request as any).rawBody as Buffer | string | undefined;
    const headerSig = request.headers['x-hub-signature-256'];
    const signature = Array.isArray(headerSig) ? headerSig[0] : headerSig;

    if (!verifyHmac(rawBody, signature, env.ADO_WEBHOOK_SECRET)) {
      return reply.code(401).send({ error: 'Invalid HMAC signature' });
    }

    const payload = request.body as any;
    const eventType = payload?.eventType;
    const resource = payload?.resource;

    const isWorkItemEvent =
      eventType === 'workitem.created' || eventType === 'workitem.updated';
    const isPrEvent =
      eventType === 'git.pullrequest.created' ||
      eventType === 'git.pullrequest.updated' ||
      eventType === 'git.pullrequest.merged';

    if (!isWorkItemEvent && !isPrEvent) {
      return reply.code(200).send({ status: 'ignored_event_type' });
    }

    const payloadHash = crypto.createHash('sha256').update(rawBody || '').digest('hex');

    if (isPrEvent) {
      const workItemId = extractWorkItemId(resource);
      if (!workItemId) {
        request.log.warn({ eventType }, 'PR event missing work item reference');
        return reply.code(200).send({ status: 'ignored_no_work_item' });
      }

      const prRevId =
        (crypto.createHash('sha256').update(rawBody || '').digest().readInt32BE(0) >>> 0) || 1;

      // SQLite atomic deduplication check
      try {
        db.insert(dedupEvents).values({
          workItemId,
          revId: prRevId,
          status: 'pending',
          payloadHash,
          receivedAt: new Date(),
        }).run();
      } catch (err: any) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          request.log.warn(
            { workItemId, pullRequestId: resource?.pullRequestId },
            'Duplicate PR delivery ignored'
          );
          return reply.code(200).send({ status: 'duplicate_ignored' });
        }
        throw err;
      }

      reply.code(202).send({
        status: 'accepted',
        workItemId,
        pullRequestId: resource?.pullRequestId,
      });

      workItemQueueManager.getLane(workItemId).add(async () => {
        try {
          if (activePrHandler) {
            await activePrHandler(payload);
          }
          db.update(dedupEvents)
            .set({ status: 'completed' })
            .where(
              and(
                eq(dedupEvents.workItemId, workItemId),
                eq(dedupEvents.revId, prRevId)
              )
            )
            .run();
        } catch (err: any) {
          request.log.error(
            { err, workItemId, pullRequestId: resource?.pullRequestId },
            'Background PR event processing failed'
          );
          db.update(dedupEvents)
            .set({
              status: 'failed',
              errorMessage: err?.message || String(err),
            })
            .where(
              and(
                eq(dedupEvents.workItemId, workItemId),
                eq(dedupEvents.revId, prRevId)
              )
            )
            .run();
        }
      });
      return;
    }

    const workItemId = Number(resource?.workItemId || resource?.id);
    const revId = Number(resource?.rev || resource?.fields?.['System.Rev']);

    if (!Number.isInteger(workItemId) || workItemId <= 0 || !Number.isInteger(revId) || revId <= 0) {
      return reply.code(400).send({ error: 'Missing or invalid workItemId or revId' });
    }

    const revisedById = resource?.revisedBy?.id;
    const historyComment = resource?.fields?.['System.History'];

    // Bot echo shield
    const echoCheck = isBotEcho({
      revisedById,
      historyComment,
      botId: env.ADO_BOT_ID,
    });

    if (echoCheck.isEcho) {
      request.log.info({ workItemId, revId, reason: echoCheck.reason }, 'Bot echo dropped');
      try {
        db.insert(dedupEvents).values({
          workItemId,
          revId,
          status: 'skipped',
          payloadHash,
          receivedAt: new Date(),
        }).run();
      } catch {
        // Ignore duplicate entry if already recorded
      }
      return reply.code(200).send({ status: 'bot_echo_ignored' });
    }

    // SQLite atomic deduplication check
    try {
      db.insert(dedupEvents).values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash,
        receivedAt: new Date(),
      }).run();
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        request.log.warn({ workItemId, revId }, 'Duplicate delivery ignored');
        return reply.code(200).send({ status: 'duplicate_ignored' });
      }
      throw err;
    }

    // Acknowledge immediately in <100ms
    reply.code(202).send({ status: 'accepted', workItemId, revId });

    // Background processing in dedicated per-work-item lane
    workItemQueueManager.getLane(workItemId).add(async () => {
      if (activeHandler) {
        try {
          await activeHandler(workItemId, revId);
        } catch (err) {
          request.log.error({ err, workItemId, revId }, 'Background work item processing failed');
        }
      }
    });
  });
}
