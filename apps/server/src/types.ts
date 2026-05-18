import type { users } from './db/client'

export type UserRow = typeof users.$inferSelect

/**
 * Authenticated principal on a request.
 *
 * `user` is always populated by `requireAuth`. For installation-scoped
 * apiKeys (minted during GitHub App install via the CLI bootstrap flow)
 * the user is a sentinel — `id: 'installation:<id>'`, `githubId: 0` — and
 * `installation` is populated alongside. Handlers that look up real user
 * rows in the DB will find nothing for the sentinel, which fails safely;
 * handlers that need to refuse installation-scoped principals can check
 * `c.get('installation')`.
 */
export interface AppVariables {
  user: UserRow
  installation?: { installationId: number; orgId: string }
  orgId?: string
}
