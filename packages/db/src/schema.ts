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

/**
 * Runbooks are reusable patterns distilled from one or more successful
 * episodes. The body is human-readable Markdown — the same content the
 * SKILL.md exporter wraps with frontmatter so an external agent can load
 * the runbook as context. `triggers` and `ops_used` are jsonb arrays of
 * free-form strings; the distillation pipeline (Phase 2B) will refine the
 * structure later.
 */
export const runbooks = pgTable(
  'runbooks',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
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

/**
 * Many-to-many edge between a runbook and the SKILL.md "skill" names it is
 * exported under. Today we only ever export a single skill per runbook, but
 * the join table is here so we can later attach the same runbook under
 * multiple skill names without a schema change.
 */
export const runbookSkills = pgTable(
  'runbook_skills',
  {
    runbookId: text('runbook_id')
      .notNull()
      .references(() => runbooks.id, { onDelete: 'cascade' }),
    skillName: text('skill_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runbookId, table.skillName] }),
    index('runbook_skills_skill_name_idx').on(table.skillName),
  ],
)

// --- Credential vault + audit log + per-org install state (Slice 2) ---

/**
 * Per-org credential vault. `encrypted_value` is an opaque string — the
 * envelope shape is owned by `apps/server/src/vault/`. Production target is
 * pgsodium on Supabase Postgres (per ORCHENTRA_PLAN.md §3.3.5); the in-tree
 * fallback wraps Node `aes-256-gcm` with the same envelope so dev/CI work
 * without a Supabase dependency. Decryption is bounded to the vault module
 * regardless of which backend produced the bytes.
 */
export const credentials = pgTable(
  'credentials',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** e.g. 'github.app.private_key', 'datadog.api_key'. */
    kind: text('kind').notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    /** Granted scopes — text[] so callers can filter without parsing. */
    scopes: jsonb('scopes').notNull().default([]),
    metadata: jsonb('metadata').notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('credentials_org_kind_unique').on(table.orgId, table.kind),
    index('credentials_org_id_idx').on(table.orgId),
  ],
)

/**
 * Append-only audit trail for vault reads, install state changes, and any
 * other security-sensitive operation. `actor` carries `{ type, id }`.
 * `metadata` is jsonb; the writer is responsible for redacting secret bytes
 * before insertion (the vault module enforces this at its boundary).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actor: jsonb('actor').notNull(),
    action: text('action').notNull(),
    resource: jsonb('resource'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_org_id_idx').on(table.orgId),
    index('audit_log_action_idx').on(table.action),
    index('audit_log_org_created_idx').on(table.orgId, table.createdAt),
  ],
)

/**
 * Per-org GitHub App install state. Populated by the install callback
 * (Slice 3) and read by `getOctokitForInstall(orgId)` to resolve the right
 * install id when minting App tokens. `installation_id` is unique because a
 * GH installation maps to exactly one (App, account) pair.
 */
export const githubInstallations = pgTable(
  'github_installations',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    installationId: bigint('installation_id', { mode: 'number' }).notNull(),
    accountLogin: text('account_login').notNull(),
    /** GitHub returns 'User' | 'Organization'. */
    accountType: text('account_type').notNull(),
    /** 'all' | 'selected' per the GH App webhook payload. */
    repositorySelection: text('repository_selection').notNull(),
    permissions: jsonb('permissions').notNull().default({}),
    events: jsonb('events').notNull().default([]),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('github_installations_installation_id_unique').on(table.installationId),
    index('github_installations_org_id_idx').on(table.orgId),
  ],
)

/**
 * Slice 6 — pending approval requests for write/destructive ops invoked
 * over the MCP HTTP transport. The dispatcher persists a row here when the
 * approval gate cannot resolve synchronously; the human (or another agent)
 * acks via `POST /api/approvals/:id/ack`, which flips `status` and unblocks
 * the suspended awaitApproval poll on the server.
 *
 * `actor` shape: { id: string, type?: 'user' | 'agent' | 'system' }.
 * `metadata` is jsonb and intentionally free-form so adapters can stash
 * Octokit snapshot context (diff URL, target branch, etc.) without a
 * schema migration per op.
 */
export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    operationId: text('operation_id').notNull(),
    /** Trust class at request time. Snapshotted so policy changes don't reinterpret old rows. */
    trustClass: text('trust_class').notNull(),
    /** Zod-validated input (redacted by the writer). */
    input: jsonb('input').notNull(),
    requestedBy: jsonb('requested_by').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** 'pending' | 'approved' | 'denied' | 'expired'. */
    status: text('status').notNull().default('pending'),
    decidedBy: jsonb('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => [
    index('approval_requests_org_status_idx').on(table.orgId, table.status),
    index('approval_requests_expires_at_idx').on(table.expiresAt),
  ],
)
