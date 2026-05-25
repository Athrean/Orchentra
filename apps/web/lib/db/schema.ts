import { bigint, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

// Mirrors Supabase auth.users — we only reference the id, never write.
export const authUsers = pgTable('users', {
  id: uuid('id').primaryKey(),
})

export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  username: text('username').unique(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  githubUsername: text('github_username'),
  llmProvider: text('llm_provider').default('anthropic'),
  llmKeyEncrypted: text('llm_key_encrypted'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const cliInstalls = pgTable(
  'cli_installs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    machineId: text('machine_id').notNull(),
    hostname: text('hostname'),
    os: text('os'),
    cliVersion: text('cli_version'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('cli_installs_user_machine_key').on(t.userId, t.machineId)],
)

export const monitoredRepos = pgTable(
  'monitored_repos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    defaultBranch: text('default_branch'),
    githubInstallationId: bigint('github_installation_id', { mode: 'number' }),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('monitored_repos_user_owner_name_key').on(t.userId, t.owner, t.name)],
)

export const executions = pgTable('executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => monitoredRepos.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'),
  githubRunId: bigint('github_run_id', { mode: 'number' }),
  githubWorkflowName: text('github_workflow_name'),
  branch: text('branch'),
  commitSha: text('commit_sha'),
  rootCause: text('root_cause'),
  suggestedFix: text('suggested_fix'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).default('0'),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  mttrSeconds: integer('mttr_seconds'),
})

export const nodes = pgTable('nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  executionId: uuid('execution_id')
    .notNull()
    .references(() => executions.id, { onDelete: 'cascade' }),
  parentNodeId: uuid('parent_node_id'),
  kind: text('kind').notNull(),
  integration: text('integration'),
  round: integer('round').default(0),
  durationMs: integer('duration_ms'),
  argsJson: jsonb('args_json'),
  resultJson: jsonb('result_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id').notNull(),
  role: text('role').notNull(),
  content: text('content'),
  toolCallsJson: jsonb('tool_calls_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type CliInstall = typeof cliInstalls.$inferSelect
export type MonitoredRepo = typeof monitoredRepos.$inferSelect
export type NewMonitoredRepo = typeof monitoredRepos.$inferInsert
export type Execution = typeof executions.$inferSelect
export type NewExecution = typeof executions.$inferInsert
export type Node = typeof nodes.$inferSelect
export type ChatMessage = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert
