import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';

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

export type DedupEvent = typeof dedupEvents.$inferSelect;
export type InsertDedupEvent = typeof dedupEvents.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
