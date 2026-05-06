/**
 * github_installations CRUD tests.
 *
 * Same in-memory-store pattern as the vault tests — no global drizzle-orm
 * mock so unrelated tests stay green.
 */

import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import {
  recordInstallation,
  getInstallationByOrg,
  getDefaultInstallation,
  setInstallationStoreForTesting,
} from '../src/github/installations'
import type { GithubInstallation, InstallationStore, RecordInstallationInput } from '../src/github/installations'

class InMemoryInstallationStore implements InstallationStore {
  rows: GithubInstallation[] = []

  async upsert(input: RecordInstallationInput): Promise<void> {
    const now = new Date()
    const idx = this.rows.findIndex((r) => r.installationId === input.installationId)
    const row: GithubInstallation = {
      orgId: input.orgId,
      installationId: input.installationId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      repositorySelection: input.repositorySelection,
      permissions: input.permissions ?? {},
      events: input.events ?? [],
      installedAt: idx >= 0 ? this.rows[idx].installedAt : now,
      updatedAt: now,
      suspendedAt: input.suspendedAt ?? null,
    }
    if (idx >= 0) this.rows[idx] = row
    else this.rows.push(row)
  }

  async fetchByOrg(orgId: string): Promise<GithubInstallation | null> {
    return this.rows.find((r) => r.orgId === orgId) ?? null
  }
}

let store: InMemoryInstallationStore

afterAll(() => {
  setInstallationStoreForTesting(null)
})

afterEach(() => {
  store = new InMemoryInstallationStore()
  setInstallationStoreForTesting(store)
})

store = new InMemoryInstallationStore()
setInstallationStoreForTesting(store)

describe('recordInstallation + getInstallationByOrg', () => {
  test('upserts a new row when the installation_id has never been seen', async () => {
    await recordInstallation({
      orgId: 'org-1',
      installationId: 129899882,
      accountLogin: 'Athrean',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: { contents: 'read', issues: 'write' },
      events: ['push', 'pull_request'],
    })
    const row = await getInstallationByOrg('org-1')
    expect(row).not.toBeNull()
    expect(row!.installationId).toBe(129899882)
    expect(row!.accountLogin).toBe('Athrean')
    expect(row!.permissions).toEqual({ contents: 'read', issues: 'write' })
    expect(row!.events).toEqual(['push', 'pull_request'])
  })

  test('upsert by installation_id replaces the prior row in place', async () => {
    await recordInstallation({
      orgId: 'org-1',
      installationId: 129899882,
      accountLogin: 'Athrean',
      accountType: 'Organization',
      repositorySelection: 'selected',
    })
    await recordInstallation({
      orgId: 'org-1',
      installationId: 129899882,
      accountLogin: 'Athrean',
      accountType: 'Organization',
      repositorySelection: 'all',
      events: ['workflow_run'],
    })
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].repositorySelection).toBe('all')
    expect(store.rows[0].events).toEqual(['workflow_run'])
  })

  test('returns null when the org has no installation yet', async () => {
    expect(await getInstallationByOrg('unseen-org')).toBeNull()
  })

  test('suspendedAt round-trips when set', async () => {
    const when = new Date('2026-05-06T00:00:00Z')
    await recordInstallation({
      orgId: 'org-1',
      installationId: 1,
      accountLogin: 'a',
      accountType: 'User',
      repositorySelection: 'all',
      suspendedAt: when,
    })
    const row = await getInstallationByOrg('org-1')
    expect(row!.suspendedAt?.toISOString()).toBe(when.toISOString())
  })
})

describe('getDefaultInstallation', () => {
  const ORIGINAL_APP_ID = process.env.GITHUB_APP_ID
  const ORIGINAL_KEY_PATH = process.env.GITHUB_APP_PRIVATE_KEY_PATH
  const ORIGINAL_INSTALL_ID = process.env.GITHUB_APP_INSTALLATION_ID

  afterAll(() => {
    process.env.GITHUB_APP_ID = ORIGINAL_APP_ID
    process.env.GITHUB_APP_PRIVATE_KEY_PATH = ORIGINAL_KEY_PATH
    process.env.GITHUB_APP_INSTALLATION_ID = ORIGINAL_INSTALL_ID
  })

  test('returns null when env-fallback is not configured', async () => {
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_APP_PRIVATE_KEY_PATH
    delete process.env.GITHUB_APP_INSTALLATION_ID
    const { setInstallationStoreForTesting } = await import('../src/github/installations')
    const { createMemoryInstallationStore } = await import('../src/github/installations-memory-store')
    setInstallationStoreForTesting(createMemoryInstallationStore())
    expect(await getDefaultInstallation()).toBeNull()
  })
})
