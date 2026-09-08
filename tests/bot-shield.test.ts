import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyHmac } from '../src/ingress/hmac.js';
import { isBotEcho } from '../src/ingress/bot-shield.js';

describe('HMAC SHA256 Verification', () => {
  const secret = 'super-secret-webhook-key';
  const payload = JSON.stringify({ eventType: 'workitem.updated', id: 42 });

  it('returns true for valid signature with sha256= prefix', () => {
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signature = `sha256=${hash}`;

    expect(verifyHmac(payload, signature, secret)).toBe(true);
  });

  it('returns true for valid signature without prefix', () => {
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifyHmac(payload, hash, secret)).toBe(true);
  });

  it('returns false for tampered body', () => {
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const tampered = JSON.stringify({ eventType: 'workitem.updated', id: 999 });

    expect(verifyHmac(tampered, `sha256=${hash}`, secret)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifyHmac(payload, `sha256=${hash}`, 'wrong-secret')).toBe(false);
  });

  it('handles malformed / mismatched length signature without throwing RangeError', () => {
    expect(verifyHmac(payload, 'sha256=short', secret)).toBe(false);
    expect(verifyHmac(payload, 'invalid-hex', secret)).toBe(false);
    expect(verifyHmac(payload, '', secret)).toBe(false);
    expect(verifyHmac(undefined, 'sha256=123', secret)).toBe(false);
    expect(verifyHmac(payload, undefined, secret)).toBe(false);
  });
});

describe('Bot Echo Shield', () => {
  const botId = '00000000-0000-0000-0000-000000000001';

  it('returns isEcho: true when revisedById matches botId', () => {
    const result = isBotEcho({
      revisedById: botId,
      botId,
    });
    expect(result.isEcho).toBe(true);
    expect(result.reason).toBe('Actor matches ADO_BOT_ID');
  });

  it('returns isEcho: true (case-insensitive) when revisedById matches botId', () => {
    const result = isBotEcho({
      revisedById: botId.toUpperCase(),
      botId: botId.toLowerCase(),
    });
    expect(result.isEcho).toBe(true);
  });

  it('returns isEcho: true when history comment contains [automated-agent] marker', () => {
    const result = isBotEcho({
      revisedById: 'human-user-id',
      historyComment: '<div>Updated by [automated-agent] worker</div>',
      botId,
    });
    expect(result.isEcho).toBe(true);
    expect(result.reason).toBe('History comment contains [automated-agent] marker');
  });

  it('returns isEcho: false for normal human edits', () => {
    const result = isBotEcho({
      revisedById: 'human-user-id',
      historyComment: 'Fixed description acceptance criteria',
      botId,
    });
    expect(result.isEcho).toBe(false);
  });
});
