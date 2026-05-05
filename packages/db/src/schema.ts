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

/**
 * Executions are the root unit of the execution graph. Each row represents one
 * end-to-end run produced by a trigger (CI failure today; future: alert, deploy,
 * cron). The `kind` column discriminates the trigger source. `root_node_id`
 * points at the entry node of the graph for this execution.
 *
 * The legacy `incidents` export is kept as a TS alias so existing consumers
 * continue to compile during the migration to the graph primitive.
 */
export const executions = pgTable(
  'executions',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
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

    // LLM output
    briefJson: text('brief_json'),
    confidence: doublePrecision('confidence'),
    rootCause: text('root_cause'),
    suggestedFix: text('suggested_fix'),
    patchJson: text('patch_json'),

    // Actions
    githubIssueUrl: text('github_issue_url'),
    githubPrUrl: text('github_pr_url'),
    githubCheckRunId: bigint('github_check_run_id', { mode: 'number' }),
    githubTriageCommentIds: jsonb('github_triage_comment_ids'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),

    // Token usage & cost tracking
    tokenInputs: integer('token_inputs'),
    tokenOutputs: integer('token_outputs'),
    estimatedCostUsd: doublePrecision('estimated_cost_usd'),

    // Timing
    triggeredAt: timestamp('triggered_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    mttrSeconds: integer('mttr_seconds'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('incidents_workflow_run_id_idx').on(table.orgId, table.workflowRunId),
    index('incidents_org_id_idx').on(table.orgId),
    index('executions_kind_idx').on(table.kind),
  ],
)

/** Legacy alias — same table, same row shape. Drop after consumer migration. */
export const incidents = executions

/**
 * Nodes are the children of an execution. Each row is one step the engine took
 * (LLM tool call today; future: decision, human_review, patch, rollback).
 * `parent_node_id` introduces the DAG edge that was previously implicit in
 * `tool_calls.round`.
 *
 * The legacy `toolCalls` export is kept as a TS alias.
 */
export const nodes = pgTable('nodes', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').references(() => executions.id, { onDelete: 'cascade' }),
  parentNodeId: text('parent_node_id'),
  kind: text('kind').notNull().default('tool_call'),
  integration: text('integration').notNull(),
  round: integer('round').notNull(),
  durationMs: integer('duration_ms'),
  argsJson: text('args_json'),
  resultJson: text('result_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Legacy alias — same table. */
export const toolCalls = nodes

export const resolvedPatterns = pgTable('resolved_patterns', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
      .references(() => incidents.id, { onDelete: 'cascade' }),
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
  githubAccessToken: text('github_access_token'),
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
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
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
  (table) => [uniqueIndex('monitored_repos_org_repo_unique').on(table.orgId, table.repo)],
)

// --- Incident job queue ---

export const incidentJobs = pgTable(
  'incident_jobs',
  {
    id: text('id').primaryKey(),
    incidentId: text('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('queued'), // queued | processing | completed | failed | dead_letter
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull().defaultNow(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('incident_jobs_incident_id_idx').on(table.incidentId),
    index('incident_jobs_claimable_idx').on(table.status, table.nextRunAt),
  ],
)

// --- Webhook ingestion ---

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull().default('github'),
    eventId: text('event_id').notNull(),
    eventType: text('event_type'),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'), // pending | processed | failed | skipped
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    retryCount: integer('retry_count').notNull().default(0),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('webhook_events_provider_event_id_idx').on(table.provider, table.eventId),
    index('webhook_events_status_idx').on(table.status),
  ],
)

/**
 * Cron specs — orgs schedule recurring skill runs by inserting one row per
 * (org, skill, expression). A scheduler tick reads due rows, spawns an
 * execution with kind='cron' for each, and updates `last_ticked_at`.
 *
 * Phase 2 lands storage + a pure tick selector. The scheduler runtime that
 * actually emits executions lands in a follow-up.
 */
export const cronSpecs = pgTable(
  'cron_specs',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    skillName: text('skill_name').notNull(),
    cronExpr: text('cron_expr').notNull(),
    lastTickedAt: timestamp('last_ticked_at', { withTimezone: true }),
    enabled: integer('enabled').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('cron_specs_org_skill_idx').on(table.orgId, table.skillName),
    index('cron_specs_enabled_idx').on(table.enabled),
  ],
)

/**
 * Persistent chat message history per org+session.
 * Each row is one turn (user or assistant). Tool call deltas are not stored
 * individually — the final assistant text after tool execution is the only
 * assistant row written per turn.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Opaque session ID supplied by the client — groups a conversation thread. */
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chat_messages_org_session_created_idx').on(table.orgId, table.sessionId, table.createdAt)],
)

/**
 * Per-org LLM configuration overrides the global env-based default.
 * `apiKeyCiphertext` stores the customer's API key encrypted with AES-256-GCM
 * (key = LLM_CONFIG_SECRET env var). `apiKeyIv` + `apiKeyTag` are the matching
 * IV and auth tag.
 */
export const orgLlmConfigs = pgTable('org_llm_configs', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('openrouter'),
  modelId: text('model_id').notNull(),
  apiKeyCiphertext: text('api_key_ciphertext'),
  apiKeyIv: text('api_key_iv'),
  apiKeyTag: text('api_key_tag'),
  baseUrl: text('base_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- Brain skeleton tables (Phase 2) ---

/**
 * Episodes are the append-only "what happened" log for the brain. Each row
 * references the originating execution so a reader can join back to the full
 * node graph when the summary alone is not enough. `ops_called` stores the
 * flat list of operation ids the run used so a future runbook distiller can
 * group similar episodes without re-walking the node tree.
 */
export const episodes = pgTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    /** Mirrors executions.kind so episodes can be filtered without a join. */
    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    /** JSON-encoded array of operation ids — kept as text to stay portable. */
    opsCalled: jsonb('ops_called').notNull().default([]),
    outcome: text('outcome').notNull().default('unknown'), // 'success' | 'failure' | 'unknown'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('episodes_org_id_idx').on(table.orgId),
    index('episodes_execution_id_idx').on(table.executionId),
    index('episodes_kind_idx').on(table.kind),
  ],
)
