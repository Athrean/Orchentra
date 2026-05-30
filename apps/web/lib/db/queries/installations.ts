import { eq } from 'drizzle-orm'
import { db } from '../client'
import { userInstallations } from '../schema'
import { mergePermissions } from '../../github/permission-check'

export interface InstallationUpsert {
  installationId: number
  accountLogin: string
  accountType: 'User' | 'Organization'
  repositorySelection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
}

/** Merged GitHub App permissions across all of a user's installations (most permissive wins). */
export async function getUserInstallationPermissions(userId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ permissions: userInstallations.permissions })
    .from(userInstallations)
    .where(eq(userInstallations.userId, userId))
  return mergePermissions(rows.map((row) => (row.permissions ?? {}) as Record<string, string>))
}

/**
 * Insert-or-refresh the user-scoped projection of a GitHub App installation.
 * Shared by the install callback (post-install) and the onboarding sync
 * (discovery of an already-installed app). Idempotent on (userId, installationId).
 */
export async function upsertUserInstallation(userId: string, inst: InstallationUpsert): Promise<void> {
  await db
    .insert(userInstallations)
    .values({
      userId,
      installationId: inst.installationId,
      accountLogin: inst.accountLogin,
      accountType: inst.accountType,
      repositorySelection: inst.repositorySelection,
      permissions: inst.permissions,
      events: inst.events,
    })
    .onConflictDoUpdate({
      target: [userInstallations.userId, userInstallations.installationId],
      set: {
        accountLogin: inst.accountLogin,
        accountType: inst.accountType,
        repositorySelection: inst.repositorySelection,
        permissions: inst.permissions,
        events: inst.events,
        suspendedAt: null,
        updatedAt: new Date(),
      },
    })
}
