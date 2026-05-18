import { isNull, sql } from 'drizzle-orm'
import { db, githubInstallations } from '../db/client'

/**
 * Lowercased account logins of every non-suspended GitHub App installation.
 * Used by the org-wide repo view to mark which repos sit under an owner that
 * has the Orchentra App installed without re-issuing one GitHub API call
 * per repo.
 */
export async function listInstalledOwnerLogins(): Promise<Set<string>> {
  const rows = await db
    .select({ login: sql<string>`lower(${githubInstallations.accountLogin})` })
    .from(githubInstallations)
    .where(isNull(githubInstallations.suspendedAt))
  return new Set(rows.map((r) => r.login))
}
