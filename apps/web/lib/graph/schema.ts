import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// Read-only mirror of the server graph DB executions table.
export const executions = pgTable(
  'executions',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    kind: text('kind').notNull().default('ci_failure'),
    rootNodeId: text('root_node_id'),
    repo: text('repo').notNull(),
    branch: text('branch').notNull(),
    commit: text('commit').notNull(),
    workflowName: text('workflow_name').notNull(),
    commitMessage: text('commit_message'),
    workflowRunId: bigint('workflow_run_id', { mode: 'number' }),
    failedStep: text('failed_step'),
    status: text('status').notNull().default('investigating'),
    briefJson: text('brief_json'),
    confidence: doublePrecision('confidence'),
    rootCause: text('root_cause'),
    suggestedFix: text('suggested_fix'),
    patchJson: text('patch_json'),
    githubIssueUrl: text('github_issue_url'),
    githubPrUrl: text('github_pr_url'),
    githubCheckRunId: bigint('github_check_run_id', { mode: 'number' }),
    githubTriageCommentIds: jsonb('github_triage_comment_ids'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    modelId: text('model_id'),
    tokenInputs: integer('token_inputs'),
    tokenOutputs: integer('token_outputs'),
    estimatedCostUsd: doublePrecision('estimated_cost_usd'),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    mttrSeconds: integer('mttr_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('incidents_workflow_run_id_idx').on(table.orgId, table.workflowRunId),
    index('incidents_org_id_idx').on(table.orgId),
    index('executions_kind_idx').on(table.kind),
    index('executions_model_id_idx').on(table.modelId),
  ],
)

export const episodes = pgTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    executionId: text('execution_id').notNull(),
    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    opsCalled: jsonb('ops_called').notNull().default([]),
    outcome: text('outcome').notNull().default('unknown'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('episodes_org_id_idx').on(table.orgId),
    index('episodes_execution_id_idx').on(table.executionId),
    index('episodes_kind_idx').on(table.kind),
  ],
)

export const runbooks = pgTable(
  'runbooks',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    triggers: jsonb('triggers').notNull().default([]),
    opsUsed: jsonb('ops_used').notNull().default([]),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('runbooks_org_name_unique').on(table.orgId, table.name),
    index('runbooks_org_id_idx').on(table.orgId),
  ],
)

export type GraphExecution = typeof executions.$inferSelect
export type GraphEpisode = typeof episodes.$inferSelect
export type GraphRunbook = typeof runbooks.$inferSelect
