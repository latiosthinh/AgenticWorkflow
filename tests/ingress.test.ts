import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { webhookRoutes } from '../src/ingress/routes.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { db, sqlite } from '../src/db/index.js';
import { dedupEvents } from '../src/db/schema.js';
import { env } from '../src/config/env.js';
import { eq } from 'drizzle-orm';

describe('Fastify Ingress Webhook Routes & Queue Lanes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: false,
      encoding: 'utf8',
      runFirst: true,
    });
    await app.register(webhookRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sqlite.exec('DELETE FROM dedup_events');
  });

  function createSignature(payload: string, secret = env.ADO_WEBHOOK_SECRET): string {
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${hash}`;
  }

  it('rejects requests without HMAC signature with HTTP 401', async () => {
    const payload = JSON.stringify({
      eventType: 'workitem.updated',
      resource: { id: 101, rev: 1 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ado/webhook',
      headers: { 'content-type': 'application/json' },
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid HMAC signature' });
  });

  it('rejects requests with invalid HMAC signature with HTTP 401', async () => {
    const payload = JSON.stringify({
      eventType: 'workitem.updated',
      resource: { id: 101, rev: 1 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ado/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': createSignature(payload, 'wrong-secret'),
      },
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid HMAC signature' });
  });

  it('accepts valid HMAC and returns HTTP 202 Accepted, creating a pending dedup row', async () => {
    const workItemId = 501;
    const revId = 2;
    const payload = JSON.stringify({
      eventType: 'workitem.updated',
      resource: {
        id: workItemId,
        rev: revId,
        revisedBy: { id: 'some-human-user-guid' },
        fields: {
          'System.Rev': revId,
          'System.Title': 'Implement feature X',
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ado/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': createSignature(payload),
      },
      payload,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      status: 'accepted',
      workItemId,
      revId,
    });

    const rows = db.select().from(dedupEvents).where(eq(dedupEvents.workItemId, workItemId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].workItemId).toBe(workItemId);
    expect(rows[0].revId).toBe(revId);
    expect(rows[0].status).toBe('pending');
  });

  it('returns HTTP 200 duplicate_ignored on duplicate revId delivery', async () => {
    const workItemId = 601;
    const revId = 1;
    const payload = JSON.stringify({
      eventType: 'workitem.created',
      resource: {
        id: workItemId,
        rev: revId,
        revisedBy: { id: 'human-user' },
      },
    });
    const headers = {
      'content-type': 'application/json',
      'x-hub-signature-256': createSignature(payload),
    };

    // First request
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/ado/webhook',
      headers,
      payload,
    });
    expect(res1.statusCode).toBe(202);

    // Duplicate request
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/ado/webhook',
      headers,
      payload,
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ status: 'duplicate_ignored' });
  });

  it('returns HTTP 200 bot_echo_ignored when revisedBy matches ADO_BOT_ID', async () => {
    const workItemId = 701;
    const revId = 3;
    const payload = JSON.stringify({
      eventType: 'workitem.updated',
      resource: {
        id: workItemId,
        rev: revId,
        revisedBy: { id: env.ADO_BOT_ID },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ado/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': createSignature(payload),
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'bot_echo_ignored' });

    const rows = db.select().from(dedupEvents).where(eq(dedupEvents.workItemId, workItemId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('skipped');
  });

  it('returns HTTP 200 bot_echo_ignored when history contains [automated-agent]', async () => {
    const workItemId = 702;
    const revId = 4;
    const payload = JSON.stringify({
      eventType: 'workitem.updated',
      resource: {
        id: workItemId,
        rev: revId,
        revisedBy: { id: 'service-principal' },
        fields: {
          'System.History': '<div>Updated state by [automated-agent]</div>',
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ado/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': createSignature(payload),
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'bot_echo_ignored' });
  });

  it('creates serialized queue lane with concurrency 1 per work item', () => {
    const lane1 = workItemQueueManager.getLane(999);
    const lane2 = workItemQueueManager.getLane(999);
    const lane3 = workItemQueueManager.getLane(1000);

    expect(lane1).toBe(lane2);
    expect(lane1.concurrency).toBe(1);
    expect(lane3.concurrency).toBe(1);
    expect(lane1).not.toBe(lane3);
  });
});
