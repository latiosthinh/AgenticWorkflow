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

CREATE TABLE IF NOT EXISTS rework_cycles (
  work_item_id INTEGER PRIMARY KEY,
  bounce_count INTEGER NOT NULL DEFAULT 0,
  last_bounce_at INTEGER,
  source_gate TEXT NOT NULL,
  escalated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rework_cycles_lookup ON rework_cycles(work_item_id, bounce_count);

CREATE TABLE IF NOT EXISTS qa_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  run_index INTEGER NOT NULL,
  strike_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  failed_test_signatures TEXT,
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qa_runs_work_item ON qa_runs(work_item_id);

CREATE TABLE IF NOT EXISTS qa_bounces (
  work_item_id INTEGER PRIMARY KEY,
  bounce_count INTEGER NOT NULL DEFAULT 0,
  last_bounced_at INTEGER,
  escalated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS qa_evidence (
  work_item_id INTEGER PRIMARY KEY,
  total_tests INTEGER NOT NULL,
  passed_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  staging_url TEXT,
  flake_cleared INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deployment_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  pipeline_run_id TEXT,
  stage_name TEXT NOT NULL,
  environment_name TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  status TEXT NOT NULL,
  release_notes TEXT,
  rollback_plan TEXT,
  migration_risk TEXT,
  created_at INTEGER NOT NULL,
  deployed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_deployment_records_work_item ON deployment_records(work_item_id);

CREATE TABLE IF NOT EXISTS telemetry_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 30,
  error_rate TEXT NOT NULL,
  p95_latency_ms INTEGER NOT NULL,
  baseline_error_rate TEXT,
  baseline_p95_ms INTEGER,
  breached INTEGER NOT NULL DEFAULT 0,
  breach_reasons TEXT,
  evaluated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_evaluations_work_item ON telemetry_evaluations(work_item_id);

CREATE TABLE IF NOT EXISTS evidence_indices (
  work_item_id INTEGER PRIMARY KEY,
  l1_summary TEXT NOT NULL,
  l2_summary TEXT NOT NULL,
  l3_summary TEXT NOT NULL,
  l4_summary TEXT NOT NULL,
  l5_summary TEXT NOT NULL,
  l6_summary TEXT NOT NULL,
  completed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skills_prs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  skill_name TEXT NOT NULL,
  branchName TEXT NOT NULL,
  pull_request_id INTEGER,
  pr_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skills_prs_work_item ON skills_prs(work_item_id);



`);

export const db = drizzle(sqlite, { schema });

export function purgeOldDedupEvents(retentionDays = 7): { changes: number } {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = db.delete(dedupEvents).where(lt(dedupEvents.receivedAt, cutoff)).run();
  return { changes: result.changes };
}
