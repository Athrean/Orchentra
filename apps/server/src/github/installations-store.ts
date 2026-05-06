/**
 * Default Drizzle-backed implementation of `InstallationStore`. Lives in its
 * own file so the install state module can be unit-tested without bringing
 * the drizzle-orm import surface into the test process.
 *
 * Maps the flat DB columns (account_login, account_type) to the nested
 * `account: { login, type }` shape used by the InstallationRecord interface
 * (which matches the GH webhook payload). `account.id` is accepted at write
 * time but not persisted; the unique key is `installation_id`.
 */

import { desc, eq } from 'drizzle-orm'
import { db, githubInstallations } from '../db/client'
import type { InstallationRecord, InstallationStore, RecordInstallationInput } from './installations'

function rowToRecord(row: typeof githubInstallations.$inferSelect): InstallationRecord {
  return {
    installationId: row.installationId,
    orgId: row.orgId,
    account: {
      login: row.accountLogin,
      type: row.accountType as 'User' | 'Organization',
    },
    repositorySelection: row.repositorySelection as 'all' | 'selected',
    permissions: (row.permissions ?? {}) as Record<string, string>,
    events: Array.isArray(row.events) ? (row.events as string[]) : [],
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
    suspendedAt: row.suspendedAt,
  }
}

class DrizzleInstallationStore implements InstallationStore {
  async upsert(input: RecordInstallationInput): Promise<InstallationRecord> {
    const now = new Date()
    const [row] = await db
      .insert(githubInstallations)
      .values({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        installationId: input.installationId,
        accountLogin: input.account.login,
        accountType: input.account.type,
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
          accountLogin: input.account.login,
          accountType: input.account.type,
          repositorySelection: input.repositorySelection,
          permissions: input.permissions ?? {},
          events: input.events ?? [],
          updatedAt: now,
          suspendedAt: input.suspendedAt ?? null,
        },
      })
      .returning()
    return rowToRecord(row)
  }

  async fetchByOrg(orgId: string): Promise<InstallationRecord | null> {
    const [row] = await db.select().from(githubInstallations).where(eq(githubInstallations.orgId, orgId)).limit(1)
    return row ? rowToRecord(row) : null
  }

  async fetchByInstallationId(installationId: number): Promise<InstallationRecord | null> {
    const [row] = await db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.installationId, installationId))
      .limit(1)
    return row ? rowToRecord(row) : null
  }

  async setSuspended(installationId: number, suspendedAt: Date | null): Promise<void> {
    await db
      .update(githubInstallations)
      .set({ suspendedAt, updatedAt: new Date() })
      .where(eq(githubInstallations.installationId, installationId))
  }

  async fetchMostRecent(): Promise<InstallationRecord | null> {
    const [row] = await db.select().from(githubInstallations).orderBy(desc(githubInstallations.updatedAt)).limit(1)
    return row ? rowToRecord(row) : null
  }

  async clear(): Promise<void> {
    // Production no-op safeguard. Tests should swap the store via
    // setInstallationStoreForTesting() rather than truncating real data.
  }
}

export const defaultInstallationStore: InstallationStore = new DrizzleInstallationStore()
