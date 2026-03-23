import { pgTable, text, integer, bigint, doublePrecision, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const incidents = pgTable(
  'incidents',
  {
    id: text('id').primaryKey(),
    repo: text('repo').notNull(),
    branch: text('branch').notNull(),
    commit: text('commit').notNull(),
    workflowName: text('workflow_name').notNull(),
    workflowRunId: bigint('workflow_run_id', { mode: 'number' }),
    failedStep: text('failed_step'),
    status: text('status').notNull().default('investigating'),

    // LLM output
    briefJson: text('brief_json'),
    confidence: doublePrecision('confidence'),
    rootCause: text('root_cause'),
    suggestedFix: text('suggested_fix'),

    // Slack
    slackChannel: text('slack_channel'),
    slackMessageTs: text('slack_message_ts'),

    // Timing
    triggeredAt: timestamp('triggered_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    mttrSeconds: integer('mttr_seconds'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('incidents_workflow_run_id_idx').on(table.workflowRunId)],
)

export const toolCalls = pgTable('tool_calls', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').references(() => incidents.id),
  integration: text('integration').notNull(),
  round: integer('round').notNull(),
  durationMs: integer('duration_ms'),
  resultJson: text('result_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const resolvedPatterns = pgTable('resolved_patterns', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').references(() => incidents.id),
  embedding: text('embedding'),
  pattern: text('pattern'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
