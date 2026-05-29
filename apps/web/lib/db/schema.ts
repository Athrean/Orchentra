import { bigint, boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

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

export const userInstallations = pgTable(
  'user_installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    installationId: bigint('installation_id', { mode: 'number' }).notNull(),
    accountLogin: text('account_login').notNull(),
    accountType: text('account_type').notNull(),
    repositorySelection: text('repository_selection').notNull(),
    permissions: jsonb('permissions').notNull().default({}),
    events: jsonb('events').notNull().default([]),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  },
  (t) => [
    unique('user_installations_user_installation_key').on(t.userId, t.installationId),
    index('user_installations_user_id_idx').on(t.userId),
    index('user_installations_installation_id_idx').on(t.installationId),
  ],
)

export const repoSubscriptions = pgTable(
  'repo_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    installationId: bigint('installation_id', { mode: 'number' }).notNull(),
    repoFullName: text('repo_full_name').notNull(),
    repoId: bigint('repo_id', { mode: 'number' }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('repo_subscriptions_user_repo_key').on(t.userId, t.repoFullName),
    index('repo_subscriptions_user_id_idx').on(t.userId),
    index('repo_subscriptions_installation_id_idx').on(t.installationId),
    index('repo_subscriptions_enabled_idx').on(t.userId, t.enabled),
  ],
)

export const providerCredentials = pgTable(
  'provider_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    apiKeyCiphertext: text('api_key_ciphertext').notNull(),
    apiKeyIv: text('api_key_iv').notNull(),
    apiKeyTag: text('api_key_tag').notNull(),
    baseUrl: text('base_url'),
    defaultModel: text('default_model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('provider_credentials_user_provider_key').on(t.userId, t.provider),
    index('provider_credentials_user_id_idx').on(t.userId),
  ],
)

export const projectApiKeys = pgTable(
  'project_api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPrefix: text('token_prefix').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('project_api_keys_user_id_idx').on(t.userId)],
)

export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    signal: text('signal').notNull(),
    comparator: text('comparator').notNull(),
    threshold: text('threshold').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('alert_rules_user_id_idx').on(t.userId)],
)

export const alertHistory = pgTable(
  'alert_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('recorded'),
    message: text('message').notNull(),
    firedAt: timestamp('fired_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('alert_history_user_id_idx').on(t.userId), index('alert_history_rule_id_idx').on(t.ruleId)],
)

export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  prefs: jsonb('prefs').notNull().default({}),
  slackDm: boolean('slack_dm').notNull().default(false),
  quietHoursStart: text('quiet_hours_start'),
  quietHoursEnd: text('quiet_hours_end'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const userMemories = pgTable(
  'user_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    repo: text('repo'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    tags: text('tags').array().notNull().default([]),
    lastRecalledAt: timestamp('last_recalled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('user_memories_user_id_idx').on(t.userId), index('user_memories_user_repo_idx').on(t.userId, t.repo)],
)

export const onboardingState = pgTable('onboarding_state', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  step: text('step').notNull().default('welcome'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type CliInstall = typeof cliInstalls.$inferSelect
export type UserInstallation = typeof userInstallations.$inferSelect
export type NewUserInstallation = typeof userInstallations.$inferInsert
export type RepoSubscription = typeof repoSubscriptions.$inferSelect
export type NewRepoSubscription = typeof repoSubscriptions.$inferInsert
export type ProviderCredential = typeof providerCredentials.$inferSelect
export type NewProviderCredential = typeof providerCredentials.$inferInsert
export type ProjectApiKey = typeof projectApiKeys.$inferSelect
export type NewProjectApiKey = typeof projectApiKeys.$inferInsert
export type AlertRule = typeof alertRules.$inferSelect
export type AlertHistory = typeof alertHistory.$inferSelect
export type NotificationPrefs = typeof notificationPrefs.$inferSelect
export type OnboardingState = typeof onboardingState.$inferSelect
export type NewOnboardingState = typeof onboardingState.$inferInsert
export type OnboardingStep = 'welcome' | 'install_app' | 'select_repos' | 'completed'
export type UserMemory = typeof userMemories.$inferSelect
export type NewUserMemory = typeof userMemories.$inferInsert
