/**
 * Installation lifecycle helper — minimal in-memory stub used by Slice 3 until
 * Slice 2 lands the `github_installations` Postgres table + Drizzle queries.
 *
 * TODO(slice-2): Replace this module with the slice-2 implementation that
 * persists to `github_installations`. See PRD #314 + the slice-2 PR (in
 * parallel) for the schema. The exported function names + shapes are chosen
 * to match what slice 2 will provide so swapping is mechanical.
 */

export interface InstallationRecord {
  installationId: number
  orgId: string
  account: { login: string; type: 'User' | 'Organization'; id: number }
  repositorySelection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
  suspendedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface RecordInstallationInput {
  installationId: number
  orgId: string
  account: { login: string; type: 'User' | 'Organization'; id: number }
  repositorySelection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
  suspendedAt?: Date | null
}

// In-memory store. Slice 2 swaps this for Drizzle.
const store = new Map<number, InstallationRecord>()
// Reverse lookup so getInstallationByOrg is O(1).
const orgIndex = new Map<string, number>()

export async function recordInstallation(input: RecordInstallationInput): Promise<InstallationRecord> {
  const now = new Date()
  const existing = store.get(input.installationId)
  const record: InstallationRecord = {
    installationId: input.installationId,
    orgId: input.orgId,
    account: input.account,
    repositorySelection: input.repositorySelection,
    permissions: input.permissions,
    events: input.events,
    suspendedAt: input.suspendedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  store.set(record.installationId, record)
  orgIndex.set(record.orgId, record.installationId)
  return record
}

export async function getInstallationByOrg(orgId: string): Promise<InstallationRecord | null> {
  const id = orgIndex.get(orgId)
  if (id === undefined) return null
  return store.get(id) ?? null
}

export async function getDefaultInstallation(): Promise<InstallationRecord | null> {
  // Returns the most recently recorded installation. Slice 2 may scope this
  // by env var or org membership.
  let latest: InstallationRecord | null = null
  for (const record of store.values()) {
    if (!latest || record.updatedAt > latest.updatedAt) latest = record
  }
  return latest
}

export async function suspendInstallation(installationId: number, suspendedAt: Date = new Date()): Promise<void> {
  const existing = store.get(installationId)
  if (!existing) return
  existing.suspendedAt = suspendedAt
  existing.updatedAt = new Date()
}

// Test-only helper. Slice 2 will likely drop this in favour of test fixtures.
export function resetInstallationsStoreForTests(): void {
  store.clear()
  orgIndex.clear()
}
