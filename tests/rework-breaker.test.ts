import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { db, sqlite } from '../src/db/index.js';
import { reworkCycles } from '../src/db/schema.js';
import {
  evaluateCircuitBreaker,
  resetCircuitBreaker,
  buildEscalationPatch,
} from '../src/accept/breaker.js';

describe('Shared Rework Circuit Breaker', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM rework_cycles;');
  });

  it('Test 1: First rejection allows rework with count 1 (sourceGate: accept)', async () => {
    const workItemId = 1001;
    const result = await evaluateCircuitBreaker(workItemId, 'accept');

    expect(result).toEqual({
      allowed: true,
      currentCount: 1,
    });

    const row = db
      .select()
      .from(reworkCycles)
      .where(eq(reworkCycles.workItemId, workItemId))
      .get();

    expect(row).toBeDefined();
    expect(row?.workItemId).toBe(workItemId);
    expect(row?.bounceCount).toBe(1);
    expect(row?.sourceGate).toBe('accept');
    expect(row?.lastBounceAt).toBeInstanceOf(Date);
    expect(row?.escalatedAt).toBeNull();
  });

  it('Test 2: Second rejection allows rework with count 2 (sourceGate: pr_review)', async () => {
    const workItemId = 1002;

    const first = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(first).toEqual({ allowed: true, currentCount: 1 });

    const second = await evaluateCircuitBreaker(workItemId, 'pr_review');
    expect(second).toEqual({ allowed: true, currentCount: 2 });

    const row = db
      .select()
      .from(reworkCycles)
      .where(eq(reworkCycles.workItemId, workItemId))
      .get();

    expect(row?.bounceCount).toBe(2);
    expect(row?.sourceGate).toBe('pr_review');
    expect(row?.escalatedAt).toBeNull();
  });

  it('Test 3: Third rejection trips breaker (allowed: false, count: 3) and sets escalatedAt', async () => {
    const workItemId = 1003;

    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'pr_review');

    const third = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(third).toEqual({
      allowed: false,
      currentCount: 3,
    });

    const row = db
      .select()
      .from(reworkCycles)
      .where(eq(reworkCycles.workItemId, workItemId))
      .get();

    expect(row?.bounceCount).toBe(3);
    expect(row?.escalatedAt).toBeInstanceOf(Date);
  });

  it('Test 4: Subsequent rejection while tripped remains rejected (allowed: false)', async () => {
    const workItemId = 1004;

    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'accept');
    const third = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(third.allowed).toBe(false);
    expect(third.currentCount).toBe(3);

    const fourth = await evaluateCircuitBreaker(workItemId, 'pr_review');
    expect(fourth).toEqual({
      allowed: false,
      currentCount: 4,
    });

    const row = db
      .select()
      .from(reworkCycles)
      .where(eq(reworkCycles.workItemId, workItemId))
      .get();

    expect(row?.bounceCount).toBe(4);
    expect(row?.escalatedAt).toBeInstanceOf(Date);
  });

  it('Test 5: resetCircuitBreaker clears count to 0 and removes escalatedAt', async () => {
    const workItemId = 1005;

    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'accept');

    const trippedRow = db
      .select()
      .from(reworkCycles)
      .where(eq(reworkCycles.workItemId, workItemId))
      .get();
    expect(trippedRow?.bounceCount).toBe(3);
    expect(trippedRow?.escalatedAt).not.toBeNull();

    resetCircuitBreaker(workItemId);

    const resetRow = db
      .select()
      .from(reworkCycles)
      .where(eq(reworkCycles.workItemId, workItemId))
      .get();
    expect(resetRow?.bounceCount).toBe(0);
    expect(resetRow?.escalatedAt).toBeNull();

    // After reset, subsequent bounce starts fresh at count 1 with allowed: true
    const nextResult = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(nextResult).toEqual({
      allowed: true,
      currentCount: 1,
    });
  });

  it('Test 6: buildEscalationPatch returns expected operations for System.State = Blocked and [rework-escalated]', () => {
    const workItemId = 1006;
    const patch = buildEscalationPatch(
      workItemId,
      3,
      'backend; [awaiting-acceptance]'
    );

    // Tag patch operations
    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp?.op).toBe(Operation.Replace);
    expect(tagOp?.value).toContain('[rework-escalated]');
    expect(tagOp?.value).not.toContain('[awaiting-acceptance]');
    expect(tagOp?.value).toContain('backend');

    // State patch operation
    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    });

    // Escalation comment history operation
    const historyOp = patch.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp?.op).toBe(Operation.Add);
    expect(historyOp?.value).toContain('[Rework Escalated] Circuit Breaker Tripped');
    expect(historyOp?.value).toContain('3 automated rework bounces');
    expect(historyOp?.value).toContain('[reset-rework]');
    expect(historyOp?.value).toContain('<!-- [automated-agent] -->');
  });

  it('Test 7: buildEscalationPatch handles undefined currentTags cleanly', () => {
    const workItemId = 1007;
    const patch = buildEscalationPatch(workItemId, 3);

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp?.op).toBe(Operation.Add);
    expect(tagOp?.value).toBe('[rework-escalated]');
  });
});
