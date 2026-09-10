import { sqliteTable, integer, text, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const dedupEvents = sqliteTable('dedup_events', {
  workItemId: integer('work_item_id').notNull(),
  revId: integer('rev_id').notNull(),
  status: text('status', { enum: ['pending', 'completed', 'skipped', 'failed'] })
    .notNull()
    .default('pending'),
  payloadHash: text('payload_hash').notNull(),
  errorMessage: text('error_message'),
  receivedAt: integer('received_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  primaryKey({ columns: [table.workItemId, table.revId] }),
]);

export const auditLogs = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workItemId: integer('work_item_id').notNull(),
  revId: integer('rev_id').notNull(),
  verdict: text('verdict', { enum: ['passed', 'failed'] }).notNull(),
  reasons: text('reasons').notNull(),
  criteriaSummary: text('criteria_summary').notNull(),
  model: text('model').notNull(),
  evaluatedAt: integer('evaluated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const planCheckpoints = sqliteTable(
  'plan_checkpoints',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workItemId: integer('work_item_id').notNull(),
    revId: integer('rev_id').notNull(),
    status: text('status', {
      enum: ['pending_human_input', 'resumed', 'locked', 'blocked', 'expired'],
    })
      .notNull()
      .default('pending_human_input'),
    questions: text('questions').notNull(),
    answers: text('answers'),
    planMarkdown: text('plan_markdown'),
    estimatedFiles: text('estimated_files'),
    testStrategy: text('test_strategy'),
    remindedAt: integer('reminded_at', { mode: 'timestamp' }),
    escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_plan_checkpoints_lookup').on(table.workItemId, table.status),
    index('idx_plan_checkpoints_status').on(table.status),
  ]
);

export const l3Evidence = sqliteTable(
  'l3_evidence',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workItemId: integer('work_item_id').notNull(),
    revId: integer('rev_id').notNull(),
    testSuite: text('test_suite').notNull(),
    totalTests: integer('total_tests').notNull(),
    passed: integer('passed').notNull(),
    failed: integer('failed').notNull(),
    durationMs: integer('duration_ms').notNull(),
    coverageSummary: text('coverage_summary'),
    gitDiffStat: text('git_diff_stat').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_l3_evidence_lookup').on(table.workItemId, table.revId),
  ]
);

export const reworkCycles = sqliteTable(
  'rework_cycles',
  {
    workItemId: integer('work_item_id').primaryKey(),
    bounceCount: integer('bounce_count').notNull().default(0),
    lastBounceAt: integer('last_bounce_at', { mode: 'timestamp' }),
    sourceGate: text('source_gate', { enum: ['accept', 'pr_review'] }).notNull(),
    escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_rework_cycles_lookup').on(table.workItemId, table.bounceCount),
  ]
);

export const qaRuns = sqliteTable('qa_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workItemId: integer('work_item_id').notNull(),
  runIndex: integer('run_index').notNull(),
  strikeCount: integer('strike_count').notNull().default(0),
  status: text('status', { enum: ['passed', 'failed', 'flaked'] }).notNull(),
  failedTestSignatures: text('failed_test_signatures'),
  stdout: text('stdout'),
  stderr: text('stderr'),
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('idx_qa_runs_work_item').on(table.workItemId),
]);

export const qaBounces = sqliteTable('qa_bounces', {
  workItemId: integer('work_item_id').primaryKey(),
  bounceCount: integer('bounce_count').notNull().default(0),
  lastBouncedAt: integer('last_bounced_at', { mode: 'timestamp' }),
  escalated: integer('escalated').notNull().default(0),
});

export const qaEvidence = sqliteTable('qa_evidence', {
  workItemId: integer('work_item_id').primaryKey(),
  totalTests: integer('total_tests').notNull(),
  passedCount: integer('passed_count').notNull(),
  failedCount: integer('failed_count').notNull(),
  durationMs: integer('duration_ms').notNull(),
  commitSha: text('commit_sha').notNull(),
  stagingUrl: text('staging_url'),
  flakeCleared: integer('flake_cleared').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const deploymentRecords = sqliteTable('deployment_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workItemId: integer('work_item_id').notNull(),
  pipelineRunId: text('pipeline_run_id'),
  stageName: text('stage_name').notNull(),
  environmentName: text('environment_name').notNull(),
  commitSha: text('commit_sha').notNull(),
  status: text('status', { enum: ['pending_approval', 'deployed', 'failed', 'rejected'] }).notNull(),
  releaseNotes: text('release_notes'),
  rollbackPlan: text('rollback_plan'),
  migrationRisk: text('migration_risk'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  deployedAt: integer('deployed_at', { mode: 'timestamp' }),
}, (table) => [
  index('idx_deployment_records_work_item').on(table.workItemId),
]);

export const telemetryEvaluations = sqliteTable('telemetry_evaluations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workItemId: integer('work_item_id').notNull(),
  windowMinutes: integer('window_minutes').notNull().default(30),
  errorRate: text('error_rate').notNull(),
  p95LatencyMs: integer('p95_latency_ms').notNull(),
  baselineErrorRate: text('baseline_error_rate'),
  baselineP95Ms: integer('baseline_p95_ms'),
  breached: integer('breached').notNull().default(0),
  breachReasons: text('breach_reasons'),
  evaluatedAt: integer('evaluated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('idx_telemetry_evaluations_work_item').on(table.workItemId),
]);

export const evidenceIndices = sqliteTable('evidence_indices', {
  workItemId: integer('work_item_id').primaryKey(),
  l1Summary: text('l1_summary').notNull(),
  l2Summary: text('l2_summary').notNull(),
  l3Summary: text('l3_summary').notNull(),
  l4Summary: text('l4_summary').notNull(),
  l5Summary: text('l5_summary').notNull(),
  l6Summary: text('l6_summary').notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const skillsPrs = sqliteTable('skills_prs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workItemId: integer('work_item_id').notNull(),
  skillName: text('skill_name').notNull(),
  branchName: text('branch_name').notNull(),
  pullRequestId: integer('pull_request_id'),
  prUrl: text('pr_url'),
  status: text('status', { enum: ['pending_review', 'merged', 'closed'] })
    .notNull()
    .default('pending_review'),
  summary: text('summary').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('idx_skills_prs_work_item').on(table.workItemId),
]);

export type DedupEvent = typeof dedupEvents.$inferSelect;
export type InsertDedupEvent = typeof dedupEvents.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type PlanCheckpoint = typeof planCheckpoints.$inferSelect;
export type InsertPlanCheckpoint = typeof planCheckpoints.$inferInsert;
export type L3Evidence = typeof l3Evidence.$inferSelect;
export type InsertL3Evidence = typeof l3Evidence.$inferInsert;
export type ReworkCycle = typeof reworkCycles.$inferSelect;
export type InsertReworkCycle = typeof reworkCycles.$inferInsert;
export type QaRun = typeof qaRuns.$inferSelect;
export type InsertQaRun = typeof qaRuns.$inferInsert;
export type QaBounce = typeof qaBounces.$inferSelect;
export type InsertQaBounce = typeof qaBounces.$inferInsert;
export type QaEvidence = typeof qaEvidence.$inferSelect;
export type InsertQaEvidence = typeof qaEvidence.$inferInsert;
export type DeploymentRecord = typeof deploymentRecords.$inferSelect;
export type InsertDeploymentRecord = typeof deploymentRecords.$inferInsert;
export type TelemetryEvaluation = typeof telemetryEvaluations.$inferSelect;
export type InsertTelemetryEvaluation = typeof telemetryEvaluations.$inferInsert;
export type EvidenceIndex = typeof evidenceIndices.$inferSelect;
export type InsertEvidenceIndex = typeof evidenceIndices.$inferInsert;
export type SkillsPr = typeof skillsPrs.$inferSelect;
export type InsertSkillsPr = typeof skillsPrs.$inferInsert;
