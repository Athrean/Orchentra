import {
  pgTable,
  text,
  integer,
  bigint,
  doublePrecision,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core'

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

    // Actions
    githubIssueUrl: text('github_issue_url'),
    githubPrUrl: text('github_pr_url'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),

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
  failureType: text('failure_type'),
  usageCount: integer('usage_count').notNull().default(0),
  lastMatchedAt: timestamp('last_matched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const incidentActions = pgTable(
  'incident_actions',
  {
    id: text('id').primaryKey(),
    incidentId: text('incident_id')
      .notNull()
      .references(() => incidents.id),
    actionType: text('action_type').notNull(), // rerun | create_issue | create_pr | dismiss | snooze | escalate | resolve
    performedBy: text('performed_by').references(() => users.id),
    metadata: jsonb('metadata'), // action-specific data (URLs, durations, error messages)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('incident_actions_incident_id_idx').on(table.incidentId)],
)

// --- Org & multi-tenancy tables ---

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const orgMembers = pgTable(
  'org_members',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'owner' | 'admin' | 'member'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.orgId, table.userId] }), index('org_members_user_id_idx').on(table.userId)],
)

// --- Auth & product foundation tables ---

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  githubId: integer('github_id').notNull().unique(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('api_keys_key_hash_idx').on(table.keyHash), index('api_keys_user_id_idx').on(table.userId)],
)

export const monitoredRepos = pgTable(
  'monitored_repos',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    addedBy: text('added_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('monitored_repos_org_repo_unique').on(table.orgId, table.repo),
    index('monitored_repos_org_id_idx').on(table.orgId),
  ],
)
