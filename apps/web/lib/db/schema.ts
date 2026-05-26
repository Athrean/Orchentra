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
export type OnboardingState = typeof onboardingState.$inferSelect
export type NewOnboardingState = typeof onboardingState.$inferInsert
export type OnboardingStep = 'welcome' | 'install_app' | 'select_repos' | 'completed'
