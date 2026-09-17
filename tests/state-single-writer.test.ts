import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { OffLaneMutationError, serializeTicketDocument } from '../src/state/store.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import type { TicketState } from '../src/state/types.js';

describe('Single-Writer Invariant and Crash Atomicity (STATE-03)', () => {
  let harness: TestStateStoreContext;

  beforeEach(() => {
    harness = createTestStateStore();
  });

  afterEach(async () => {
    await workItemQueueManager.drainAll();
    harness.cleanup();
  });

  it('Test 1: rejects direct updateTicketState call outside runInLane with OffLaneMutationError', async () => {
    await expect(
      harness.store.updateTicketState(101, (draft) => {
        draft.revId = 1;
      })
    ).rejects.toThrow(OffLaneMutationError);

    await expect(
      harness.store.updateTicketState(101, (draft) => {
        draft.revId = 1;
      })
    ).rejects.toThrow(
      'Off-lane mutation rejected: mutation for workItemId 101 must be executed inside its dedicated lane (active lane: none).'
    );
  });

  it('Test 2: rejects cross-ticket mutation when workItemId does not match active lane', async () => {
    await expect(
      workItemQueueManager.runInLane(101, async () => {
        return harness.store.updateTicketState(202, (draft) => {
          draft.revId = 1;
        });
      })
    ).rejects.toThrow(OffLaneMutationError);

    await expect(
      workItemQueueManager.runInLane(101, async () => {
        return harness.store.updateTicketState(202, (draft) => {
          draft.revId = 1;
        });
      })
    ).rejects.toThrow(
      'Off-lane mutation rejected: mutation for workItemId 202 must be executed inside its dedicated lane (active lane: 101).'
    );
  });

  it('Test 3: executes mutation inside matching workItemId lane and persists updated state', async () => {
    const created = await workItemQueueManager.runInLane(101, async () => {
      return harness.store.updateTicketState(
        101,
        (draft) => {
          draft.revId = 1;
          draft.auditLogs.push({
            revId: 1,
            verdict: 'passed',
            reasons: 'All DoD criteria met',
            criteriaSummary: 'Passed 4/4',
            model: 'gpt-4o',
            evaluatedAt: new Date().toISOString(),
          });
        },
        '## Initial Audit Notes\nPassed.'
      );
    });

    expect(created.workItemId).toBe(101);
    expect(created.revId).toBe(1);
    expect(created.auditLogs).toHaveLength(1);

    const fetched = await harness.store.getTicketState(101);
    expect(fetched).not.toBeNull();
    expect(fetched?.workItemId).toBe(101);
    expect(fetched?.revId).toBe(1);

    const notes = await harness.store.getTicketNotes(101);
    expect(notes).toContain('## Initial Audit Notes');
  });

  it('Test 4: recovers newest valid sibling temp file when reading non-existent target ticket', async () => {
    const ticketsDir = path.join(harness.tempDir, 'tickets');
    const olderTemp = path.join(ticketsDir, '.101.md.tmp.1000.aaaa');
    const newerTemp = path.join(ticketsDir, '.101.md.tmp.2000.bbbb');

    const baseState: TicketState = {
      workItemId: 101,
      revId: 1,
      createdAt: '2026-09-17T12:00:00.000Z',
      updatedAt: '2026-09-17T12:00:00.000Z',
      auditLogs: [],
      planCheckpoints: [],
      l3Evidence: [],
      qaRuns: [],
      deploymentRecords: [],
      telemetryEvaluations: [],
      skillsPrs: [],
    };

    const stateOlder: TicketState = { ...baseState, revId: 1 };
    const stateNewer: TicketState = { ...baseState, revId: 2 };

    fs.writeFileSync(olderTemp, serializeTicketDocument(stateOlder, 'Older notes content'), 'utf8');
    fs.utimesSync(olderTemp, 1000, 1000);

    fs.writeFileSync(newerTemp, serializeTicketDocument(stateNewer, 'Newer notes content'), 'utf8');
    fs.utimesSync(newerTemp, 2000, 2000);

    const targetPath = path.join(ticketsDir, '101.md');
    expect(fs.existsSync(targetPath)).toBe(false);

    // getTicketState recovers newer file
    const recoveredState = await harness.store.getTicketState(101);
    expect(recoveredState).not.toBeNull();
    expect(recoveredState?.revId).toBe(2);
    expect(fs.existsSync(targetPath)).toBe(true);

    const recoveredNotes = await harness.store.getTicketNotes(101);
    expect(recoveredNotes).toContain('Newer notes content');
  });

  it('Test 5: preserves existing file intact if mutator throws before write', async () => {
    await workItemQueueManager.runInLane(101, async () => {
      return harness.store.updateTicketState(
        101,
        (draft) => {
          draft.revId = 1;
        },
        'Original intact notes'
      );
    });

    await expect(
      workItemQueueManager.runInLane(101, async () => {
        return harness.store.updateTicketState(101, () => {
          throw new Error('Simulation of unexpected failure inside mutator callback');
        });
      })
    ).rejects.toThrow('Simulation of unexpected failure inside mutator callback');

    const intact = await harness.store.getTicketState(101);
    expect(intact?.revId).toBe(1);

    const notes = await harness.store.getTicketNotes(101);
    expect(notes).toBe('Original intact notes');
  });

  it('Test 6: serializes concurrent mutations on the same lane without collision', async () => {
    const update1 = workItemQueueManager.runInLane(101, async () => {
      return harness.store.updateTicketState(101, (draft) => {
        draft.revId = 1;
      });
    });

    const update2 = workItemQueueManager.runInLane(101, async () => {
      return harness.store.updateTicketState(101, (draft) => {
        draft.revId = 2;
      });
    });

    await Promise.all([update1, update2]);

    const finalState = await harness.store.getTicketState(101);
    expect(finalState?.revId).toBe(2);
  });
});
