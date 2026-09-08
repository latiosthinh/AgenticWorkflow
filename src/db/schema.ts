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

export type DedupEvent = typeof dedupEvents.$inferSelect;
export type InsertDedupEvent = typeof dedupEvents.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type PlanCheckpoint = typeof planCheckpoints.$inferSelect;
export type InsertPlanCheckpoint = typeof planCheckpoints.$inferInsert;
