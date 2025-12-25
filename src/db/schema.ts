import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// runs - Individual query() invocations
export const runTable = sqliteTable('ccr_runs', {
  id: text('id').primaryKey(),

  // Environment
  cwd: text('cwd').notNull(),             // Working directory for this run

  // Session tracking
  sessionId: text('session_id').notNull(),       // SDK session_id (grouping key)
  parentSessionId: text('parent_session_id'),           // If forked, the source session_id

  // Invocation type
  mode: text('mode').notNull(),            // 'fresh' | 'resume' | 'fork'

  // Run data
  status: text('status').notNull(),          // running|completed|error|cancelled
  prompt: text('prompt').notNull(),
  resultType: text('result_type'),                // SDK result subtype
  resultJson: text('result_json'),                // Full SDKResultMessage as JSON
  durationMs: integer('duration_ms'),
  createdAt: text('created_at'),
});

// run_messages - Raw SDKMessage storage
export const runMessageTable = sqliteTable('ccr_run_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull(),
  index: integer('index').notNull(),
  messageType: text('message_type').notNull(),     // SDKMessage.type
  messageJson: text('message_json').notNull(),     // Full SDKMessage as JSON
  createdAt: text('created_at'),
});

// Type exports
export type Run = typeof runTable.$inferSelect;
export type NewRun = typeof runTable.$inferInsert;
export type RunMessage = typeof runMessageTable.$inferSelect;
export type NewRunMessage = typeof runMessageTable.$inferInsert;
