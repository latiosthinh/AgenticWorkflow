import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';

describe('StateStore Directory Scans and Archive Lifecycle', () => {
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

  it('scans active tickets directory and excludes archived tickets', async () => {
    const ticketIds = [1001, 1002, 1003, 1004, 1005];

    for (const id of ticketIds) {
      await workItemQueueManager.runInLane(id, async () => {
        await stateStore.updateTicketState(id, (draft) => {
          draft.auditLogs.push({
            revId: 1,
            verdict: 'passed',
            reasons: 'Initial audit',
            criteriaSummary: 'Criteria met',
            model: 'test-model',
            evaluatedAt: new Date().toISOString(),
          });
        });
      });
    }

    const initialActive = await stateStore.listTickets();
    expect(initialActive).toHaveLength(5);

    // Archive 2 tickets
    await stateStore.archiveTicket(1001);
    await stateStore.archiveTicket(1002);

    // Assert listTickets returns exactly the 3 remaining active tickets
    const activeTickets = await stateStore.listTickets();
    expect(activeTickets).toHaveLength(3);
    const activeIds = activeTickets.map((t) => t.workItemId).sort();
    expect(activeIds).toEqual([1003, 1004, 1005]);

    // Assert archived tickets exist in archive directory
    const archiveDir = path.join(harness.tempDir, 'archive');
    const ticketsDir = path.join(harness.tempDir, 'tickets');

    expect(fs.existsSync(path.join(archiveDir, '1001.md'))).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, '1002.md'))).toBe(true);
    expect(fs.existsSync(path.join(ticketsDir, '1001.md'))).toBe(false);
    expect(fs.existsSync(path.join(ticketsDir, '1002.md'))).toBe(false);
    expect(fs.existsSync(path.join(ticketsDir, '1003.md'))).toBe(true);
  });

  it('handles archiving non-existent ticket without error', async () => {
    await expect(stateStore.archiveTicket(9999)).resolves.not.toThrow();
  });

  it('ignores non-markdown files and dotfiles during listTickets scan', async () => {
    const workItemId = 2001;
    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.planCheckpoints.push({
          id: 1,
          revId: 1,
          status: 'resumed',
          questions: '[]',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
    });

    const ticketsDir = path.join(harness.tempDir, 'tickets');
    // Create stray non-markdown files and temp files
    fs.writeFileSync(path.join(ticketsDir, '.2001.md.tmp.123'), 'temp content');
    fs.writeFileSync(path.join(ticketsDir, 'notes.txt'), 'random text file');
    fs.writeFileSync(path.join(ticketsDir, 'unrelated.json'), '{}');

    const tickets = await stateStore.listTickets();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].workItemId).toBe(2001);
  });

  it('returns empty array if tickets directory is empty', async () => {
    const tickets = await stateStore.listTickets();
    expect(tickets).toEqual([]);
  });

  it('overwrites archive destination if ticket re-archived', async () => {
    const workItemId = 3001;
    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.revId = 1;
      });
    });

    await stateStore.archiveTicket(workItemId);
    const archiveDir = path.join(harness.tempDir, 'archive');
    expect(fs.existsSync(path.join(archiveDir, '3001.md'))).toBe(true);

    // Re-create active ticket and archive again
    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.revId = 2;
      });
    });

    await stateStore.archiveTicket(workItemId);
    expect(fs.existsSync(path.join(archiveDir, '3001.md'))).toBe(true);
    const tickets = await stateStore.listTickets();
    expect(tickets.find((t) => t.workItemId === workItemId)).toBeUndefined();
  });
});
