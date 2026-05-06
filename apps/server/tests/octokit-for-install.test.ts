/**
 * getOctokitForInstall — vault → env → PAT resolution order.
 *
 * Uses the in-memory store seams from vault + installations so the test
 * exercises real resolution code without a Postgres dependency.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Stub `../src/config` before any module that loads it pulls in the missing
// orchentra.yml. This is the same pattern used by backfill.test.ts.
mock.module('../src/config', () => ({
  config: {
    github: {
      webhook_secret: 'secret',
      token: 'pat-fallback',
      api_base_url: 'https://api.github.com',
      repos: [],
    },
    llm: {
      api_key: 'sk-test',
      model: 'anthropic/test-model',
      embedding_model: 'text-embedding-3-small',
    },
  },
}))

const { setOctokitForOrgForTesting, setOctokitForTesting, resetOctokitForTesting, getOctokitForInstall } =
  await import('../src/github/octokit')
type OctokitLike = Awaited<ReturnType<typeof getOctokitForInstall>>
import {
  setVaultStoreForTesting,
  storeCredential,
  type VaultStore,
  type VaultStoredRow,
  type VaultAuditEntry,
} from '../src/vault'
import {
  setInstallationStoreForTesting,
  recordInstallation,
  type InstallationStore,
  type GithubInstallation,
  type RecordInstallationInput,
} from '../src/github/installations'

// --- Pluggable in-memory stores (re-used across tests) ---

class MemVault implements VaultStore {
  rows = new Map<string, { row: VaultStoredRow }>()
  audits: VaultAuditEntry[] = []
  async upsert(orgId: string, kind: string, row: VaultStoredRow): Promise<void> {
    this.rows.set(`${orgId}:${kind}`, { row })
  }
  async fetch(orgId: string, kind: string): Promise<VaultStoredRow | null> {
    return this.rows.get(`${orgId}:${kind}`)?.row ?? null
  }
  async update(orgId: string, kind: string, row: VaultStoredRow): Promise<void> {
    this.rows.set(`${orgId}:${kind}`, { row })
  }
  async audit(entry: VaultAuditEntry): Promise<void> {
    this.audits.push(entry)
  }
}

class MemInstall implements InstallationStore {
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

const ORIGINAL = {
  appId: process.env.GITHUB_APP_ID,
  keyPath: process.env.GITHUB_APP_PRIVATE_KEY_PATH,
  installId: process.env.GITHUB_APP_INSTALLATION_ID,
  secret: process.env.LLM_CONFIG_SECRET,
}

beforeAll(() => {
  process.env.LLM_CONFIG_SECRET = 'install-test-secret-32-bytes-min!!'
})

afterAll(() => {
  process.env.GITHUB_APP_ID = ORIGINAL.appId
  process.env.GITHUB_APP_PRIVATE_KEY_PATH = ORIGINAL.keyPath
  process.env.GITHUB_APP_INSTALLATION_ID = ORIGINAL.installId
  process.env.LLM_CONFIG_SECRET = ORIGINAL.secret
  setVaultStoreForTesting(null)
  setInstallationStoreForTesting(null)
  resetOctokitForTesting()
})

afterEach(() => {
  setOctokitForOrgForTesting('org-1', null)
  setOctokitForOrgForTesting('org-2', null)
  setVaultStoreForTesting(new MemVault())
  setInstallationStoreForTesting(new MemInstall())
  resetOctokitForTesting()
  delete process.env.GITHUB_APP_ID
  delete process.env.GITHUB_APP_PRIVATE_KEY_PATH
  delete process.env.GITHUB_APP_INSTALLATION_ID
})

setVaultStoreForTesting(new MemVault())
setInstallationStoreForTesting(new MemInstall())

const sentinel = (label: string): OctokitLike => ({ __label: label }) as unknown as OctokitLike

function tempPemDir(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'orchentra-install-test-'))
  const path = join(dir, 'key.pem')
  const pem = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF32MNAqs5f+lqjgIlxhUeqVrYvmF',
    'placeholderplaceholderplaceholderplaceholderplaceholderplaceholder',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n')
  writeFileSync(path, pem, { mode: 0o600 })
  return { path, cleanup: (): void => rmSync(dir, { recursive: true, force: true }) }
}

describe('getOctokitForInstall — resolution order', () => {
  test('per-org test override wins over everything else', async () => {
    const stub = sentinel('org-override')
    setOctokitForOrgForTesting('org-1', stub)
    const got = await getOctokitForInstall('org-1')
    expect(got).toBe(stub)
  })

  test('vault credential + installation row produces an App-scoped client', async () => {
    const actor = { type: 'system' as const, id: 'test' }
    await storeCredential({
      orgId: 'org-1',
      kind: 'github.app.private_key',
      value: '-----BEGIN RSA PRIVATE KEY-----\nplaceholderplaceholderplaceholder\n-----END RSA PRIVATE KEY-----',
      metadata: { appId: 3617072 },
      actor,
    })
    await recordInstallation({
      orgId: 'org-1',
      installationId: 129899882,
      accountLogin: 'Athrean',
      accountType: 'Organization',
      repositorySelection: 'selected',
    })
    const got = await getOctokitForInstall('org-1')
    expect(got).toBeDefined()
    // App-built clients expose the same surfaces as the PAT path.
    expect(got.repos).toBeDefined()
    expect(got.actions).toBeDefined()
  })

  test('falls through to env-based App auth when vault has no credential', async () => {
    const pem = tempPemDir()
    try {
      process.env.GITHUB_APP_ID = '3617072'
      process.env.GITHUB_APP_PRIVATE_KEY_PATH = pem.path
      process.env.GITHUB_APP_INSTALLATION_ID = '129899882'
      const got = await getOctokitForInstall('org-1')
      expect(got).toBeDefined()
      expect(got.repos).toBeDefined()
    } finally {
      pem.cleanup()
    }
  })

  test('falls through to PAT when neither vault nor env is configured', async () => {
    const pat = sentinel('pat-default')
    setOctokitForTesting(pat)
    const got = await getOctokitForInstall('org-1')
    expect(got).toBe(pat)
  })

  test('does not leak orgA install id when orgB has its own row', async () => {
    const actor = { type: 'system' as const, id: 'test' }
    await storeCredential({
      orgId: 'org-a',
      kind: 'github.app.private_key',
      value: '-----BEGIN RSA PRIVATE KEY-----\nplaceholderplaceholderplaceholder\n-----END RSA PRIVATE KEY-----',
      metadata: { appId: 3617072 },
      actor,
    })
    await recordInstallation({
      orgId: 'org-a',
      installationId: 1,
      accountLogin: 'a',
      accountType: 'User',
      repositorySelection: 'all',
    })
    await recordInstallation({
      orgId: 'org-b',
      installationId: 2,
      accountLogin: 'b',
      accountType: 'User',
      repositorySelection: 'all',
    })

    // org-a has both vault + install -> App client.
    const aClient = await getOctokitForInstall('org-a')
    expect(aClient.repos).toBeDefined()

    // org-b has install row but no vault credential, no env -> PAT fallback.
    const patSentinel = sentinel('pat-shared')
    setOctokitForTesting(patSentinel)
    const bClient = await getOctokitForInstall('org-b')
    expect(bClient).toBe(patSentinel)
  })
})
