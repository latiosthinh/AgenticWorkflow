import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { verifyHmac } from './hmac.js';
import { isBotEcho } from './bot-shield.js';
import { stateStore } from '../state/index.js';
import { workItemQueueManager } from '../queue/lane-manager.js';
import { env } from '../config/env.js';
import { processWorkItemAudit } from '../auditor/worker.js';
import { handlePullRequestEvent, extractWorkItemId } from './pr-router.js';
import { processQaVerification } from '../qa/worker.js';

export { processQaVerification };

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

      // File-backed atomic deduplication check
      const { isDuplicate } = stateStore.recordDedupEvent(workItemId, prRevId, payloadHash);
      if (isDuplicate) {
        request.log.warn(
          { workItemId, pullRequestId: resource?.pullRequestId },
          'Duplicate PR delivery ignored'
        );
        return reply.code(200).send({ status: 'duplicate_ignored' });
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
          stateStore.updateDedupStatus(workItemId, prRevId, 'completed');
        } catch (err: any) {
          request.log.error(
            { err, workItemId, pullRequestId: resource?.pullRequestId },
            'Background PR event processing failed'
          );
          stateStore.updateDedupStatus(
            workItemId,
            prRevId,
            'failed',
            err?.message || String(err)
          );
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
        const { isDuplicate } = stateStore.recordDedupEvent(workItemId, revId, payloadHash);
        if (!isDuplicate) {
          stateStore.updateDedupStatus(workItemId, revId, 'skipped', echoCheck.reason);
        }
      } catch {
        // Ignore duplicate entry if already recorded
      }
      return reply.code(200).send({ status: 'bot_echo_ignored' });
    }

    // File-backed atomic deduplication check
    const { isDuplicate } = stateStore.recordDedupEvent(workItemId, revId, payloadHash);
    if (isDuplicate) {
      request.log.warn({ workItemId, revId }, 'Duplicate delivery ignored');
      return reply.code(200).send({ status: 'duplicate_ignored' });
    }

    // Acknowledge immediately in <100ms
    reply.code(202).send({ status: 'accepted', workItemId, revId });

    // Background processing in dedicated per-work-item lane
    workItemQueueManager.getLane(workItemId).add(async () => {
      if (activeHandler) {
        try {
          await activeHandler(workItemId, revId);
        } catch (err: any) {
          request.log.error({ err, workItemId, revId }, 'Background work item processing failed');
          stateStore.updateDedupStatus(workItemId, revId, 'failed', err?.message || String(err));
        }
      }
    });
  });
}
