import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import {
  evaluateCircuitBreaker,
  resetCircuitBreaker,
  buildEscalationPatch,
} from '../src/accept/breaker.js';

describe('Shared Rework Circuit Breaker', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
  });

  it('Test 1: First rejection allows rework with count 1 (sourceGate: accept)', async () => {
    const workItemId = 1001;
    const result = await evaluateCircuitBreaker(workItemId, 'accept');

    expect(result).toEqual({
      allowed: true,
      currentCount: 1,
    });

    const ticket = await stateStore.getTicketState(workItemId);
    const row = ticket?.reworkCycles;

    expect(row).toBeDefined();
    expect(row?.bounceCount).toBe(1);
    expect(row?.sourceGate).toBe('accept');
    expect(row?.lastBounceAt).toBeDefined();
    expect(row?.escalatedAt).toBeFalsy();
  });

  it('Test 2: Second rejection allows rework with count 2 (sourceGate: pr_review)', async () => {
    const workItemId = 1002;

    const first = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(first).toEqual({ allowed: true, currentCount: 1 });

    const second = await evaluateCircuitBreaker(workItemId, 'pr_review');
    expect(second).toEqual({ allowed: true, currentCount: 2 });

    const ticket = await stateStore.getTicketState(workItemId);
    const row = ticket?.reworkCycles;

    expect(row?.bounceCount).toBe(2);
    expect(row?.sourceGate).toBe('pr_review');
    expect(row?.escalatedAt).toBeFalsy();
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

    const ticket = await stateStore.getTicketState(workItemId);
    const row = ticket?.reworkCycles;

    expect(row?.bounceCount).toBe(3);
    expect(row?.escalatedAt).toBeDefined();
    expect(row?.escalatedAt).not.toBeNull();
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

    const ticket = await stateStore.getTicketState(workItemId);
    const row = ticket?.reworkCycles;

    expect(row?.bounceCount).toBe(4);
    expect(row?.escalatedAt).toBeDefined();
    expect(row?.escalatedAt).not.toBeNull();
  });

  it('Test 5: resetCircuitBreaker clears count to 0 and removes escalatedAt', async () => {
    const workItemId = 1005;

    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'accept');

    const trippedTicket = await stateStore.getTicketState(workItemId);
    expect(trippedTicket?.reworkCycles?.bounceCount).toBe(3);
    expect(trippedTicket?.reworkCycles?.escalatedAt).not.toBeNull();

    await resetCircuitBreaker(workItemId);

    const resetTicket = await stateStore.getTicketState(workItemId);
    expect(resetTicket?.reworkCycles?.bounceCount).toBe(0);
    expect(resetTicket?.reworkCycles?.escalatedAt).toBeNull();

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
