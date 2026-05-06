/**
 * Per-org GitHub App install state.
 *
 * Exposes:
 *   recordInstallation(input)            — upsert on installation_id
 *   getInstallationByOrg(orgId)          — read the org's row
 *   getDefaultInstallation()             — env-fallback for single-tenant
 *
 * No webhook ingestion this slice — Slice 3 wires the install callback that
 * calls recordInstallation. This module owns the persistence + read API only.
 *
 * As with the vault, persistence is delegated to a swappable store so unit
 * tests don't need to globally mock drizzle-orm.
 */

import { defaultInstallationStore } from './installations-store'
import { loadAppCredentialsFromEnv } from './octokit-app'

export interface GithubInstallation {
  orgId: string
  installationId: number
  accountLogin: string
  accountType: 'User' | 'Organization'
  repositorySelection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
  installedAt: Date
  updatedAt: Date
  suspendedAt: Date | null
}

export interface RecordInstallationInput {
  orgId: string
  installationId: number
  accountLogin: string
  accountType: 'User' | 'Organization'
  repositorySelection: 'all' | 'selected'
  permissions?: Record<string, string>
  events?: string[]
  suspendedAt?: Date | null
}

export interface InstallationStore {
  upsert(input: RecordInstallationInput): Promise<void>
  fetchByOrg(orgId: string): Promise<GithubInstallation | null>
}

let activeStore: InstallationStore = defaultInstallationStore

export function setInstallationStoreForTesting(store: InstallationStore | null): void {
  activeStore = store ?? defaultInstallationStore
}

export async function recordInstallation(input: RecordInstallationInput): Promise<void> {
  await activeStore.upsert(input)
}

export async function getInstallationByOrg(orgId: string): Promise<GithubInstallation | null> {
  return activeStore.fetchByOrg(orgId)
}

/**
 * Single-tenant fallback used when no org row exists yet. Reads
 * GITHUB_APP_INSTALLATION_ID via loadAppCredentialsFromEnv so dev setups
 * keep working without a populated github_installations table.
 */
export function getDefaultInstallation(): { installationId: number } | null {
  const creds = loadAppCredentialsFromEnv()
  if (!creds || !creds.installationId) return null
  return { installationId: creds.installationId }
}
