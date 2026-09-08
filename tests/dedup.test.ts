import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqlite, purgeOldDedupEvents } from '../src/db/index.js';
import { dedupEvents } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('SQLite Deduplication Store', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM dedup_events');
  });

  it('atomically inserts a dedup event', () => {
    const workItemId = 1001;
    const revId = 1;
    const payloadHash = 'hash-abc-123';

    const result = db.insert(dedupEvents).values({
      workItemId,
      revId,
      status: 'pending',
      payloadHash,
    }).run();

    expect(result.changes).toBe(1);

    const rows = db.select().from(dedupEvents).where(eq(dedupEvents.workItemId, workItemId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].workItemId).toBe(workItemId);
    expect(rows[0].revId).toBe(revId);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].payloadHash).toBe(payloadHash);
  });

  it('throws SQLITE_CONSTRAINT_PRIMARYKEY on duplicate (workItemId, revId) insert', () => {
    const workItemId = 1002;
    const revId = 1;

    db.insert(dedupEvents).values({
      workItemId,
      revId,
      status: 'pending',
      payloadHash: 'hash-first',
    }).run();

    expect(() => {
      db.insert(dedupEvents).values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash: 'hash-duplicate',
      }).run();
    }).toThrowError(/UNIQUE constraint failed|PRIMARY KEY/i);

    try {
      db.insert(dedupEvents).values({
        workItemId,
        revId,
        status: 'pending',
        payloadHash: 'hash-duplicate',
      }).run();
    } catch (err: any) {
      expect(err.code).toBe('SQLITE_CONSTRAINT_PRIMARYKEY');
    }
  });

  it('purges records older than retentionDays and keeps recent ones', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    db.insert(dedupEvents).values({
      workItemId: 2001,
      revId: 1,
      payloadHash: 'hash-old',
      receivedAt: tenDaysAgo,
    }).run();

    db.insert(dedupEvents).values({
      workItemId: 2002,
      revId: 1,
      payloadHash: 'hash-recent',
      receivedAt: twoDaysAgo,
    }).run();

    const purgeResult = purgeOldDedupEvents(7);
    expect(purgeResult.changes).toBe(1);

    const remaining = db.select().from(dedupEvents).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].workItemId).toBe(2002);
  });
});
