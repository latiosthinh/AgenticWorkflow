import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { lt } from 'drizzle-orm';
import * as schema from './schema.js';
import { dedupEvents } from './schema.js';
import { env } from '../config/env.js';

if (env.DATABASE_PATH !== ':memory:') {
  const dir = path.dirname(env.DATABASE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const sqlite = new Database(env.DATABASE_PATH);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');

sqlite.exec(`
CREATE TABLE IF NOT EXISTS dedup_events (
  work_item_id INTEGER NOT NULL,
  rev_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload_hash TEXT NOT NULL,
  error_message TEXT,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (work_item_id, rev_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  rev_id INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  reasons TEXT NOT NULL,
  criteria_summary TEXT NOT NULL,
  model TEXT NOT NULL,
  evaluated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  rev_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_human_input',
  questions TEXT NOT NULL,
  answers TEXT,
  plan_markdown TEXT,
  estimated_files TEXT,
  test_strategy TEXT,
  reminded_at INTEGER,
  escalated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_checkpoints_lookup ON plan_checkpoints(work_item_id, status);
CREATE INDEX IF NOT EXISTS idx_plan_checkpoints_status ON plan_checkpoints(status);

CREATE TABLE IF NOT EXISTS l3_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  rev_id INTEGER NOT NULL,
  test_suite TEXT NOT NULL,
  total_tests INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  coverage_summary TEXT,
  git_diff_stat TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_l3_evidence_lookup ON l3_evidence(work_item_id, rev_id);
`);

export const db = drizzle(sqlite, { schema });

export function purgeOldDedupEvents(retentionDays = 7): { changes: number } {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = db.delete(dedupEvents).where(lt(dedupEvents.receivedAt, cutoff)).run();
  return { changes: result.changes };
}
