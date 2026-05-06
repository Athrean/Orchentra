/**
 * Vault round-trip + cross-org leak + audit tests.
 *
 * Uses the `setVaultStoreForTesting` seam to swap in an in-memory store —
 * no `mock.module('drizzle-orm', ...)` needed (process-global mocks would
 * leak into unrelated tests under bun:test).
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { storeCredential, getCredential, rotateCredential, setVaultStoreForTesting } from '../src/vault'
import type { VaultStore, VaultStoredRow, VaultAuditEntry } from '../src/vault'

interface CapturedRow extends VaultStoredRow {
  orgId: string
  kind: string
}

class InMemoryVaultStore implements VaultStore {
  rows: CapturedRow[] = []
  audits: VaultAuditEntry[] = []

  async upsert(orgId: string, kind: string, row: VaultStoredRow): Promise<void> {
    const idx = this.rows.findIndex((r) => r.orgId === orgId && r.kind === kind)
    const captured: CapturedRow = { orgId, kind, ...row }
    if (idx >= 0) this.rows[idx] = captured
    else this.rows.push(captured)
  }

  async fetch(orgId: string, kind: string): Promise<VaultStoredRow | null> {
    const r = this.rows.find((row) => row.orgId === orgId && row.kind === kind)
    if (!r) return null
    return {
      encryptedValue: r.encryptedValue,
      scopes: r.scopes,
      metadata: r.metadata,
      expiresAt: r.expiresAt,
      rotatedAt: r.rotatedAt,
    }
  }

  async update(orgId: string, kind: string, row: VaultStoredRow): Promise<void> {
    const idx = this.rows.findIndex((r) => r.orgId === orgId && r.kind === kind)
    if (idx >= 0) this.rows[idx] = { orgId, kind, ...row }
  }

  async audit(entry: VaultAuditEntry): Promise<void> {
    this.audits.push(entry)
  }
}

let store: InMemoryVaultStore

const ORIGINAL_SECRET = process.env.LLM_CONFIG_SECRET

beforeAll(() => {
  process.env.LLM_CONFIG_SECRET = 'vault-test-secret-32-bytes-min!!'
})

afterAll(() => {
  process.env.LLM_CONFIG_SECRET = ORIGINAL_SECRET
  setVaultStoreForTesting(null)
})

afterEach(() => {
  store = new InMemoryVaultStore()
  setVaultStoreForTesting(store)
})

// Initial store install before the first test runs.
store = new InMemoryVaultStore()
setVaultStoreForTesting(store)

const actor = { type: 'system' as const, id: 'test-runner' }

describe('vault — credential round-trip', () => {
  test('seal -> store -> fetch -> open returns original plaintext', async () => {
    const plaintext = '-----BEGIN RSA PRIVATE KEY-----\nfake-key-bytes\n-----END RSA PRIVATE KEY-----'
    await storeCredential({
      orgId: 'org-1',
      kind: 'github.app.private_key',
      value: plaintext,
      scopes: ['repo:read'],
      metadata: { installationId: 129899882 },
      actor,
    })

    const got = await getCredential('org-1', 'github.app.private_key', actor)
    expect(got).not.toBeNull()
    expect(got!.value).toBe(plaintext)
    expect(got!.scopes).toEqual(['repo:read'])
    expect(got!.metadata).toEqual({ installationId: 129899882 })
  })

  test('encrypted_value column is not equal to plaintext', async () => {
    const plaintext = 'super-secret-token'
    await storeCredential({
      orgId: 'org-1',
      kind: 'datadog.api_key',
      value: plaintext,
      actor,
    })
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].encryptedValue).not.toBe(plaintext)
    expect(store.rows[0].encryptedValue.split(':')).toHaveLength(3)
  })

  test('returns null when the credential does not exist', async () => {
    const got = await getCredential('org-1', 'github.app.private_key', actor)
    expect(got).toBeNull()
  })
})

describe('vault — cross-org isolation', () => {
  test('orgA cannot fetch orgB credential of the same kind', async () => {
    await storeCredential({
      orgId: 'org-a',
      kind: 'github.app.private_key',
      value: 'orgA-secret',
      actor,
    })
    await storeCredential({
      orgId: 'org-b',
      kind: 'github.app.private_key',
      value: 'orgB-secret',
      actor,
    })

    const fromA = await getCredential('org-a', 'github.app.private_key', actor)
    const fromB = await getCredential('org-b', 'github.app.private_key', actor)
    expect(fromA?.value).toBe('orgA-secret')
    expect(fromB?.value).toBe('orgB-secret')

    const stranger = await getCredential('org-a', 'datadog.api_key', actor)
    expect(stranger).toBeNull()
  })
})

describe('vault — audit trail', () => {
  test('storeCredential writes a vault.write audit row with redacted metadata', async () => {
    await storeCredential({
      orgId: 'org-1',
      kind: 'github.app.private_key',
      value: 'secret',
      actor,
    })
    expect(store.audits).toHaveLength(1)
    const entry = store.audits[0]
    expect(entry.action).toBe('vault.write')
    expect(entry.orgId).toBe('org-1')
    expect(entry.actor).toEqual(actor)
    expect(entry.resource).toEqual({ kind: 'github.app.private_key' })
    // The audit entry MUST NOT contain the plaintext or the full ciphertext —
    // only a sha-256 prefix fingerprint.
    expect(JSON.stringify(entry.metadata)).not.toContain('secret')
    expect(entry.metadata.fingerprint).toBeDefined()
    expect(typeof entry.metadata.fingerprint).toBe('string')
    expect((entry.metadata.fingerprint as string).length).toBeLessThanOrEqual(16)
  })

  test('getCredential writes a vault.read audit row', async () => {
    await storeCredential({
      orgId: 'org-1',
      kind: 'github.app.private_key',
      value: 'secret',
      actor,
    })
    store.audits.length = 0
    await getCredential('org-1', 'github.app.private_key', actor)
    expect(store.audits).toHaveLength(1)
    expect(store.audits[0].action).toBe('vault.read')
  })

  test('rotateCredential writes a vault.rotate audit row distinct from write', async () => {
    await storeCredential({
      orgId: 'org-1',
      kind: 'github.app.private_key',
      value: 'old',
      actor,
    })
    await rotateCredential({
      orgId: 'org-1',
      kind: 'github.app.private_key',
      value: 'new',
      actor,
    })
    const rotateRows = store.audits.filter((r) => r.action === 'vault.rotate')
    expect(rotateRows).toHaveLength(1)
  })
})

describe('vault — crypto envelope integrity', () => {
  test('tampered envelope fails to decrypt', async () => {
    await storeCredential({
      orgId: 'org-1',
      kind: 'github.app.private_key',
      value: 'before-tamper',
      actor,
    })
    const original = store.rows[0].encryptedValue
    const [ct, iv, tag] = original.split(':')
    store.rows[0].encryptedValue = ['AAAA' + ct.slice(4), iv, tag].join(':')
    await expect(getCredential('org-1', 'github.app.private_key', actor)).rejects.toThrow()
  })
})
