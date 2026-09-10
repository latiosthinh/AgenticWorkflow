import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, sqlite } from '../src/db/index.js';
import { qaBounces } from '../db/schema.js';
import {
  MAX_QA_BOUNCES,
  evaluateQaCircuitBreaker,
  recordQaBounce,
  resetQaBounces,
  buildQaEscalationPatch,
  escalateQaToBlocked,
} from '../src/qa/breaker.js';
import { adoClient } from '../src/ado/client.js';

describe('QA Circuit Breaker and Bounce Limits', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM qa_bounces;');
    vi.restoreAllMocks();
  });

  it('allows QA execution initially when bounce count is 0', async () => {
    const workItemId = 2001;
    const evaluation = await evaluateQaCircuitBreaker(workItemId);

    expect(evaluation.allowed).toBe(true);
    expect(evaluation.currentCount).toBe(0);
    expect(evaluation.maxAllowed).toBe(MAX_QA_BOUNCES);
  });

  it('records bounces and allows rework up to MAX_QA_BOUNCES', async () => {
    const workItemId = 2002;

    const count1 = await recordQaBounce(workItemId);
    expect(count1).toBe(1);

    const eval1 = await evaluateQaCircuitBreaker(workItemId);
    expect(eval1.allowed).toBe(true);
    expect(eval1.currentCount).toBe(1);

    const count2 = await recordQaBounce(workItemId);
    expect(count2).toBe(2);

    const eval2 = await evaluateQaCircuitBreaker(workItemId);
    // At count 2 (the cap), further bounces are disallowed
    expect(eval2.allowed).toBe(false);
    expect(eval2.currentCount).toBe(2);
  });

  it('resets bounce counter to 0 upon resetQaBounces', async () => {
    const workItemId = 2003;
    await recordQaBounce(workItemId);
    await recordQaBounce(workItemId);

    let evaluation = await evaluateQaCircuitBreaker(workItemId);
    expect(evaluation.allowed).toBe(false);

    await resetQaBounces(workItemId);

    evaluation = await evaluateQaCircuitBreaker(workItemId);
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.currentCount).toBe(0);
  });

  it('builds valid ADO patch for escalation to Blocked with tags and comment', () => {
    const patch = buildQaEscalationPatch(2, '<alert>Blocked</alert>', '[qa-failed]; backend');

    const stateOp = patch.find((op) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Blocked');

    const tagOp = patch.find((op) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[qa-escalated]');
    expect(tagOp?.value).not.toContain('[qa-failed]');
    expect(tagOp?.value).toContain('backend');

    const historyOp = patch.find((op) => op.path === '/fields/System.History');
    expect(historyOp?.value).toBe('<alert>Blocked</alert>');
  });

  it('escalates work item to Blocked via ADO client', async () => {
    const workItemId = 2004;

    const getSpy = vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
      id: workItemId,
      fields: {
        'System.State': 'In Dev',
        'System.Tags': '[qa-failed]',
      },
    } as any);

    const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
      id: workItemId,
    } as any);

    await escalateQaToBlocked(workItemId, 2);

    expect(getSpy).toHaveBeenCalledWith(workItemId);
    expect(updateSpy).toHaveBeenCalledWith(
      workItemId,
      expect.arrayContaining([
        expect.objectContaining({ path: '/fields/System.State', value: 'Blocked' }),
        expect.objectContaining({ path: '/fields/System.History', value: expect.stringContaining('<!-- [automated-agent] -->') }),
      ])
    );
  });
});
