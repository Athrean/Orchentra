/**
 * Per-org GitHub App install state.
 *
 * Exposes:
 *   recordInstallation(input)            — upsert on installation_id
 *   getInstallationByOrg(orgId)          — read the org's row
 *   getDefaultInstallation()             — env fallback for single-tenant dev
 *   suspendInstallation(installationId)  — soft-delete on uninstall/suspend
 *   setInstallationStoreForTesting(store)— swap persistence in tests
 *   resetInstallationsStoreForTests()    — clear in-memory test store
 *
 * Persistence is delegated to a swappable `InstallationStore` so unit tests
 * don't need to mock drizzle-orm globally. Default store backs onto the
 * `github_installations` table via Drizzle.
 *
 * The `InstallationRecord` shape mirrors the GH webhook payload (nested
 * `account: { login, type, id }`) so the install callback handler can pass
 * payload fields straight through. The Drizzle store flattens login + type
 * onto separate columns; `account.id` is accepted but not persisted (the
 * unique key is `installation_id`).
 */

import { defaultInstallationStore } from './installations-store'
import { loadAppCredentialsFromEnv } from './octokit-app'

export interface InstallationAccount {
  login: string
  type: 'User' | 'Organization'
  id?: number
}

export interface InstallationRecord {
  installationId: number
  orgId: string
  account: InstallationAccount
  repositorySelection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
  installedAt: Date
  updatedAt: Date
  suspendedAt: Date | null
  apiKeyHash: string | null
  apiKeyIssuedAt: Date | null
}

export interface RecordInstallationInput {
  installationId: number
  orgId: string
  account: InstallationAccount
  repositorySelection: 'all' | 'selected'
  permissions?: Record<string, string>
  events?: string[]
  suspendedAt?: Date | null
  apiKeyHash?: string | null
  apiKeyIssuedAt?: Date | null
}

export interface InstallationStore {
  upsert(input: RecordInstallationInput): Promise<InstallationRecord>
  fetchByOrg(orgId: string): Promise<InstallationRecord | null>
  fetchByInstallationId(installationId: number): Promise<InstallationRecord | null>
  setSuspended(installationId: number, suspendedAt: Date | null): Promise<void>
  fetchMostRecent(): Promise<InstallationRecord | null>
  clear(): Promise<void>
}

let activeStore: InstallationStore = defaultInstallationStore

export function setInstallationStoreForTesting(store: InstallationStore | null): void {
  activeStore = store ?? defaultInstallationStore
}

export async function recordInstallation(input: RecordInstallationInput): Promise<InstallationRecord> {
  return activeStore.upsert(input)
}

export async function getInstallationByOrg(orgId: string): Promise<InstallationRecord | null> {
  return activeStore.fetchByOrg(orgId)
}

export async function suspendInstallation(installationId: number, suspendedAt: Date = new Date()): Promise<void> {
  await activeStore.setSuspended(installationId, suspendedAt)
}

export async function resetInstallationsStoreForTests(): Promise<void> {
  await activeStore.clear()
}

/**
 * Returns the most recently recorded installation, or — if the store is
 * empty — falls back to GITHUB_APP_INSTALLATION_ID via env credentials so
 * single-tenant dev setups keep working without a populated table.
 */
export async function getDefaultInstallation(): Promise<InstallationRecord | null> {
  const stored = await activeStore.fetchMostRecent()
  if (stored) return stored
  const creds = loadAppCredentialsFromEnv()
  if (!creds || !creds.installationId) return null
  const now = new Date()
  return {
    installationId: creds.installationId,
    orgId: process.env.ORCHENTRA_DEFAULT_ORG_ID ?? 'Athrean',
    account: { login: process.env.ORCHENTRA_DEFAULT_ORG_ID ?? 'Athrean', type: 'Organization' },
    repositorySelection: 'selected',
    permissions: {},
    events: [],
    installedAt: now,
    updatedAt: now,
    suspendedAt: null,
    apiKeyHash: null,
    apiKeyIssuedAt: null,
  }
}
