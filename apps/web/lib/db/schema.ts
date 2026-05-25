import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

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

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type CliInstall = typeof cliInstalls.$inferSelect
