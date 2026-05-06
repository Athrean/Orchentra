/**
 * Default Drizzle-backed implementation of `InstallationStore`. Lives in its
 * own file so the install state module can be unit-tested without bringing
 * the drizzle-orm import surface into the test process.
 */

import { eq } from 'drizzle-orm'
import { db, githubInstallations } from '../db/client'
import type { GithubInstallation, InstallationStore, RecordInstallationInput } from './installations'

class DrizzleInstallationStore implements InstallationStore {
  async upsert(input: RecordInstallationInput): Promise<void> {
    const now = new Date()
    await db
      .insert(githubInstallations)
      .values({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        installationId: input.installationId,
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        repositorySelection: input.repositorySelection,
        permissions: input.permissions ?? {},
        events: input.events ?? [],
        installedAt: now,
        updatedAt: now,
        suspendedAt: input.suspendedAt ?? null,
      })
      .onConflictDoUpdate({
        target: githubInstallations.installationId,
        set: {
          orgId: input.orgId,
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          repositorySelection: input.repositorySelection,
          permissions: input.permissions ?? {},
          events: input.events ?? [],
          updatedAt: now,
          suspendedAt: input.suspendedAt ?? null,
        },
      })
  }

  async fetchByOrg(orgId: string): Promise<GithubInstallation | null> {
    const [row] = await db.select().from(githubInstallations).where(eq(githubInstallations.orgId, orgId)).limit(1)
    if (!row) return null
    return {
      orgId: row.orgId,
      installationId: row.installationId,
      accountLogin: row.accountLogin,
      accountType: row.accountType as 'User' | 'Organization',
      repositorySelection: row.repositorySelection as 'all' | 'selected',
      permissions: (row.permissions ?? {}) as Record<string, string>,
      events: Array.isArray(row.events) ? (row.events as string[]) : [],
      installedAt: row.installedAt,
      updatedAt: row.updatedAt,
      suspendedAt: row.suspendedAt,
    }
  }
}

export const defaultInstallationStore: InstallationStore = new DrizzleInstallationStore()
