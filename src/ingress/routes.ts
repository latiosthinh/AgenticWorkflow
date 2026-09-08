import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { verifyHmac } from './hmac.js';
import { isBotEcho } from './bot-shield.js';
import { db } from '../db/index.js';
import { dedupEvents } from '../db/schema.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { env } from '../config/env.js';
import { processWorkItemAudit } from '../auditor/worker.js';

export type WorkItemHandler = (workItemId: number, revId: number) => Promise<void>;

let activeHandler: WorkItemHandler | undefined = processWorkItemAudit;

export function registerWorkItemHandler(handler: WorkItemHandler | undefined) {
  activeHandler = handler;
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

    if (eventType !== 'workitem.created' && eventType !== 'workitem.updated') {
      return reply.code(200).send({ status: 'ignored_event_type' });
    }

    const workItemId = Number(resource?.workItemId || resource?.id);
    const revId = Number(resource?.rev || resource?.fields?.['System.Rev']);

    if (!workItemId || isNaN(workItemId) || !revId || isNaN(revId)) {
      return reply.code(400).send({ error: 'Missing or invalid workItemId or revId' });
    }

    const payloadHash = crypto.createHash('sha256').update(rawBody || '').digest('hex');

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
