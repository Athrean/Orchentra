/**
 * In-memory `InstallationStore` for unit tests. Mirrors the Drizzle store's
 * behavior without touching the database. Tests should install via
 * `setInstallationStoreForTesting(createMemoryInstallationStore())` in
 * beforeEach.
 */

import type { InstallationRecord, InstallationStore, RecordInstallationInput } from './installations'

export function createMemoryInstallationStore(): InstallationStore {
  const byInstallationId = new Map<number, InstallationRecord>()
  const orgIndex = new Map<string, number>()

  return {
    async upsert(input: RecordInstallationInput): Promise<InstallationRecord> {
      const now = new Date()
      const existing = byInstallationId.get(input.installationId)
      const record: InstallationRecord = {
        installationId: input.installationId,
        orgId: input.orgId,
        account: input.account,
        repositorySelection: input.repositorySelection,
        permissions: input.permissions ?? {},
        events: input.events ?? [],
        installedAt: existing?.installedAt ?? now,
        updatedAt: now,
        suspendedAt: input.suspendedAt ?? null,
      }
      byInstallationId.set(record.installationId, record)
      orgIndex.set(record.orgId, record.installationId)
      return record
    },
    async fetchByOrg(orgId: string): Promise<InstallationRecord | null> {
      const id = orgIndex.get(orgId)
      if (id === undefined) return null
      return byInstallationId.get(id) ?? null
    },
    async fetchByInstallationId(installationId: number): Promise<InstallationRecord | null> {
      return byInstallationId.get(installationId) ?? null
    },
    async setSuspended(installationId: number, suspendedAt: Date | null): Promise<void> {
      const existing = byInstallationId.get(installationId)
      if (!existing) return
      existing.suspendedAt = suspendedAt
      existing.updatedAt = new Date()
    },
    async fetchMostRecent(): Promise<InstallationRecord | null> {
      let latest: InstallationRecord | null = null
      for (const record of byInstallationId.values()) {
        if (!latest || record.updatedAt > latest.updatedAt) latest = record
      }
      return latest
    },
    async clear(): Promise<void> {
      byInstallationId.clear()
      orgIndex.clear()
    },
  }
}
