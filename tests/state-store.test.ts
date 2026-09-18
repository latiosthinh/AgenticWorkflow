import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FileStateStore,
  parseTicketDocument,
  serializeTicketDocument,
} from '../src/state/store.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import type { TicketState } from '../src/state/types.js';

describe('StateStore frontmatter codec', () => {
  it('serializes and deserializes strict JSON frontmatter with body', () => {
    const dummyState: TicketState = {
      workItemId: 101,
      revId: 1,
      createdAt: '2026-09-17T00:00:00.000Z',
      updatedAt: '2026-09-17T00:00:00.000Z',
      auditLogs: [],
      planCheckpoints: [],
      l3Evidence: [],
      qaRuns: [],
      deploymentRecords: [],
      telemetryEvaluations: [],
      skillsPrs: [],
    };
    const body = '# Title\n\nSome execution notes.';
    const raw = serializeTicketDocument(dummyState, body);

    expect(raw).toContain('---\n');
    expect(raw).toContain('"workItemId": 101');
    expect(raw).toContain('# Title');

    const parsed = parseTicketDocument<TicketState>(raw);
    expect(parsed.frontmatter.workItemId).toBe(101);
    expect(parsed.frontmatter.revId).toBe(1);
    expect(parsed.body).toBe(body);
  });

  it('throws error when frontmatter fences are missing', () => {
    expect(() => {
      parseTicketDocument('not a fenced markdown document');
    }).toThrow(/missing frontmatter fences/i);
  });

  it('throws error when frontmatter JSON is malformed', () => {
    const malformed = '---\n{ not-valid-json }\n---\n\nbody';
    expect(() => {
      parseTicketDocument(malformed);
    }).toThrow();
  });
});

describe('FileStateStore path traversal guards', () => {
  let harness: TestStateStoreContext;

  beforeEach(() => {
    harness = createTestStateStore();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('rejects invalid workItemId types or values', async () => {
    // @ts-expect-error testing invalid input
    await expect(harness.store.getTicketState(-1)).rejects.toThrow(/positive integer/i);
    // @ts-expect-error testing invalid input
    await expect(harness.store.getTicketState(0)).rejects.toThrow(/positive integer/i);
    // @ts-expect-error testing invalid input
    await expect(harness.store.getTicketState(1.5)).rejects.toThrow(/positive integer/i);
    // @ts-expect-error testing invalid input
    await expect(harness.store.getTicketState(NaN)).rejects.toThrow(/positive integer/i);
    // @ts-expect-error testing invalid input
    await expect(harness.store.getTicketState('../101')).rejects.toThrow(/positive integer/i);
  });
});

describe('FileStateStore CRUD operations', () => {
  let harness: TestStateStoreContext;

  beforeEach(() => {
    harness = createTestStateStore();
  });

  afterEach(async () => {
    await workItemQueueManager.drainAll();
    harness.cleanup();
  });

  it('returns null for non-existent ticket', async () => {
    const state = await harness.store.getTicketState(999);
    expect(state).toBeNull();
    const notes = await harness.store.getTicketNotes(999);
    expect(notes).toBe('');
  });

  it('creates and updates ticket state with notes append', async () => {
    const created = await workItemQueueManager.runInLane(101, async () => {
      return harness.store.updateTicketState(
        101,
        (draft) => {
          draft.revId = 1;
          draft.auditLogs.push({
            revId: 1,
            verdict: 'passed',
            reasons: 'All criteria met',
            criteriaSummary: 'Passed 4/4',
            model: 'gpt-4o',
            evaluatedAt: new Date().toISOString(),
          });
        },
        '## L1 Audit\nPassed successfully.'
      );
    });

    expect(created.workItemId).toBe(101);
    expect(created.revId).toBe(1);
    expect(created.auditLogs).toHaveLength(1);
    expect(created.smokeRuns).toEqual([]);
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();

    // Verify retrieval
    const retrieved = await harness.store.getTicketState(101);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.workItemId).toBe(101);
    expect(retrieved?.auditLogs[0].verdict).toBe('passed');

    const notes = await harness.store.getTicketNotes(101);
    expect(notes).toContain('## L1 Audit');
    expect(notes).toContain('Passed successfully.');

    // Update existing ticket
    const updated = await workItemQueueManager.runInLane(101, async () => {
      return harness.store.updateTicketState(
        101,
        (draft) => {
          draft.revId = 2;
          draft.l3Evidence.push({
            revId: 2,
            testSuite: 'vitest',
            totalTests: 5,
            passed: 5,
            failed: 0,
            durationMs: 120,
            gitDiffStat: '1 file changed',
            createdAt: new Date().toISOString(),
          });
        },
        '\n## L3 Verification\nAll 5 tests passed.'
      );
    });

    expect(updated.revId).toBe(2);
    expect(updated.l3Evidence).toHaveLength(1);
    expect(updated.auditLogs).toHaveLength(1);

    const updatedNotes = await harness.store.getTicketNotes(101);
    expect(updatedNotes).toContain('## L1 Audit');
    expect(updatedNotes).toContain('## L3 Verification');
  });

  it('lists all active tickets in tickets directory', async () => {
    expect(await harness.store.listTickets()).toEqual([]);

    await workItemQueueManager.runInLane(101, async () => {
      return harness.store.updateTicketState(101, (draft) => {
        draft.revId = 1;
      });
    });
    await workItemQueueManager.runInLane(102, async () => {
      return harness.store.updateTicketState(102, (draft) => {
        draft.revId = 1;
      });
    });

    const list = await harness.store.listTickets();
    expect(list).toHaveLength(2);
    const ids = list.map((t) => t.workItemId).sort();
    expect(ids).toEqual([101, 102]);
  });

  it('archives ticket by moving it to archive directory', async () => {
    await workItemQueueManager.runInLane(101, async () => {
      return harness.store.updateTicketState(101, (draft) => {
        draft.revId = 1;
      }, 'Archived notes');
    });

    expect(await harness.store.getTicketState(101)).not.toBeNull();

    await harness.store.archiveTicket(101);

    // Active state returns null
    expect(await harness.store.getTicketState(101)).toBeNull();

    // Check archive directory contains the file
    const archivePath = path.join(harness.tempDir, 'archive', '101.md');
    expect(fs.existsSync(archivePath)).toBe(true);

    const archivedContent = fs.readFileSync(archivePath, 'utf8');
    const parsed = parseTicketDocument<TicketState>(archivedContent);
    expect(parsed.frontmatter.workItemId).toBe(101);
    expect(parsed.body).toContain('Archived notes');

    // Targeted archived lookup resolves in O(1)
    const retrievedArchived = await harness.store.getArchivedTicketState?.(101);
    expect(retrievedArchived).toEqual(parsed.frontmatter);
    expect(await harness.store.getArchivedTicketState?.(999)).toBeNull();
  });
});

describe('FileStateStore deduplication operations', () => {
  let harness: TestStateStoreContext;

  beforeEach(() => {
    harness = createTestStateStore();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('atomically records dedup event and detects duplicate deliveries', () => {
    const first = harness.store.recordDedupEvent(201, 1, 'hash-abc');
    expect(first.isDuplicate).toBe(false);
    expect(first.event.workItemId).toBe(201);
    expect(first.event.revId).toBe(1);
    expect(first.event.status).toBe('pending');
    expect(first.event.payloadHash).toBe('hash-abc');

    const second = harness.store.recordDedupEvent(201, 1, 'hash-abc');
    expect(second.isDuplicate).toBe(true);
    expect(second.event.workItemId).toBe(201);
  });

  it('updates dedup status and error message', () => {
    harness.store.recordDedupEvent(202, 1, 'hash-xyz');
    harness.store.updateDedupStatus(202, 1, 'completed');

    const markerPath = path.join(harness.tempDir, 'dedup', '202-1.json');
    const content = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(content.status).toBe('completed');

    harness.store.updateDedupStatus(202, 1, 'failed', 'Network timeout');
    const updated = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(updated.status).toBe('failed');
    expect(updated.errorMessage).toBe('Network timeout');
  });

  it('purges dedup records older than retention threshold', () => {
    harness.store.recordDedupEvent(203, 1, 'hash-old');
    const markerPath = path.join(harness.tempDir, 'dedup', '203-1.json');

    // Backdate mtime by 8 days
    const eightDaysAgo = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(markerPath, eightDaysAgo, eightDaysAgo);

    harness.store.recordDedupEvent(204, 1, 'hash-fresh');

    const purgeResult = harness.store.purgeOldDedupEvents(7);
    expect(purgeResult.changes).toBe(1);

    expect(fs.existsSync(markerPath)).toBe(false);
    const freshPath = path.join(harness.tempDir, 'dedup', '204-1.json');
    expect(fs.existsSync(freshPath)).toBe(true);
  });
});
