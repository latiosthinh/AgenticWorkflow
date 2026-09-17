import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { stateStore, purgeOldDedupEvents, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';

describe('File-Backed Deduplication Store', () => {
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

  it('records dedup event atomically with flag wx and returns isDuplicate: false on first call', () => {
    const workItemId = 1001;
    const revId = 1;
    const payloadHash = 'hash-abc-123';

    const result = stateStore.recordDedupEvent(workItemId, revId, payloadHash);

    expect(result.isDuplicate).toBe(false);
    expect(result.event.workItemId).toBe(workItemId);
    expect(result.event.revId).toBe(revId);
    expect(result.event.status).toBe('pending');
    expect(result.event.payloadHash).toBe(payloadHash);

    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    expect(fs.existsSync(markerPath)).toBe(true);

    const fileContent = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(fileContent.workItemId).toBe(workItemId);
    expect(fileContent.revId).toBe(revId);
    expect(fileContent.status).toBe('pending');
    expect(fileContent.payloadHash).toBe(payloadHash);
    expect(fileContent.receivedAt).toBeDefined();
  });

  it('returns isDuplicate: true on second call with identical (workItemId, revId)', () => {
    const workItemId = 1002;
    const revId = 1;

    const first = stateStore.recordDedupEvent(workItemId, revId, 'hash-first');
    expect(first.isDuplicate).toBe(false);

    const second = stateStore.recordDedupEvent(workItemId, revId, 'hash-duplicate');
    expect(second.isDuplicate).toBe(true);
    expect(second.event.workItemId).toBe(workItemId);
    expect(second.event.revId).toBe(revId);
  });

  it('updates dedup status and persists changes to JSON marker file', () => {
    const workItemId = 1003;
    const revId = 1;

    stateStore.recordDedupEvent(workItemId, revId, 'hash-xyz');
    stateStore.updateDedupStatus(workItemId, revId, 'completed');

    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    let content = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(content.status).toBe('completed');

    stateStore.updateDedupStatus(workItemId, revId, 'failed', 'Evaluation timeout');
    content = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(content.status).toBe('failed');
    expect(content.errorMessage).toBe('Evaluation timeout');
  });

  it('purges dedup records older than retentionDays and preserves recent records', () => {
    const workItemIdOld = 2001;
    const workItemIdRecent = 2002;
    const revId = 1;

    stateStore.recordDedupEvent(workItemIdOld, revId, 'hash-old');
    const oldMarkerPath = path.join(harness.tempDir, 'dedup', `${workItemIdOld}-${revId}.json`);

    // Backdate mtime by 10 days
    const tenDaysAgoSec = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(oldMarkerPath, tenDaysAgoSec, tenDaysAgoSec);

    stateStore.recordDedupEvent(workItemIdRecent, revId, 'hash-recent');
    const recentMarkerPath = path.join(harness.tempDir, 'dedup', `${workItemIdRecent}-${revId}.json`);

    const purgeResult = purgeOldDedupEvents(7);
    expect(purgeResult.changes).toBe(1);

    expect(fs.existsSync(oldMarkerPath)).toBe(false);
    expect(fs.existsSync(recentMarkerPath)).toBe(true);
  });

  it('handles high concurrency with Promise.all across 10 calls: exactly 1 success and 9 duplicates', async () => {
    const workItemId = 3001;
    const revId = 1;

    const calls = Array.from({ length: 10 }, (_, i) =>
      Promise.resolve().then(() =>
        stateStore.recordDedupEvent(workItemId, revId, `hash-concurrent-${i}`)
      )
    );

    const results = await Promise.all(calls);
    const successes = results.filter((r) => !r.isDuplicate);
    const duplicates = results.filter((r) => r.isDuplicate);

    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(9);

    const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
    expect(fs.existsSync(markerPath)).toBe(true);
  });
});
