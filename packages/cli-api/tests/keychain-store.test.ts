import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type KeychainShim,
  KEYCHAIN_SERVICE,
  saveCredentialAsync,
  getCredentialAsync,
  clearCredentialAsync,
  listCredentialProvidersAsync,
  resolveApiKeyAsync,
} from '../src/keychain-store'
import { credentialsPath, saveCredential, loadCredentials } from '../src/credential-store'

class InMemoryKeychain implements KeychainShim {
  private store = new Map<string, string>()
  failOnSet = false
  failOnGet = false

  private key(service: string, account: string): string {
    return `${service}::${account}`
  }
  async getPassword(service: string, account: string): Promise<string | null> {
    if (this.failOnGet) throw new Error('keychain access denied')
    return this.store.get(this.key(service, account)) ?? null
  }
  async setPassword(service: string, account: string, password: string): Promise<void> {
    if (this.failOnSet) throw new Error('keychain set denied')
    this.store.set(this.key(service, account), password)
  }
  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.store.delete(this.key(service, account))
  }
  async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
    const out: Array<{ account: string; password: string }> = []
    const prefix = `${service}::`
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(prefix)) out.push({ account: k.slice(prefix.length), password: v })
    }
    return out
  }
}

let home: string
let kc: InMemoryKeychain

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orchentra-kc-'))
  kc = new InMemoryKeychain()
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('saveCredentialAsync', () => {
  test('writes the credential to the keychain when shim is available', async () => {
    await saveCredentialAsync('anthropic', { apiKey: 'sk-test' }, home, kc)
    const raw = await kc.getPassword(KEYCHAIN_SERVICE, 'anthropic')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '{}').apiKey).toBe('sk-test')
  })

  test('does not write the credential to the plaintext file when keychain succeeds', async () => {
    await saveCredentialAsync('anthropic', { apiKey: 'sk-test' }, home, kc)
    expect(existsSync(credentialsPath(home))).toBe(false)
  })

  test('falls back to plaintext file when keychain set throws', async () => {
    kc.failOnSet = true
    await saveCredentialAsync('anthropic', { apiKey: 'sk-test' }, home, kc)
    const file = loadCredentials(home)
    expect(file.providers.anthropic?.apiKey).toBe('sk-test')
  })

  test('falls back to plaintext file when no shim is available', async () => {
    await saveCredentialAsync('openai', { apiKey: 'sk-x' }, home, null)
    expect(loadCredentials(home).providers.openai?.apiKey).toBe('sk-x')
  })
})

describe('getCredentialAsync', () => {
  test('returns credential from keychain when present', async () => {
    await kc.setPassword(KEYCHAIN_SERVICE, 'anthropic', JSON.stringify({ apiKey: 'sk-kc' }))
    const got = await getCredentialAsync('anthropic', home, kc)
    expect(got?.apiKey).toBe('sk-kc')
  })

  test('returns plaintext file credential when keychain miss', async () => {
    saveCredential('anthropic', { apiKey: 'sk-file' }, home)
    const got = await getCredentialAsync('anthropic', home, kc)
    expect(got?.apiKey).toBe('sk-file')
  })

  test('migrates plaintext credential to keychain on read', async () => {
    saveCredential('anthropic', { apiKey: 'sk-file' }, home)
    await getCredentialAsync('anthropic', home, kc)
    const raw = await kc.getPassword(KEYCHAIN_SERVICE, 'anthropic')
    expect(JSON.parse(raw ?? '{}').apiKey).toBe('sk-file')
    expect(loadCredentials(home).providers.anthropic).toBeUndefined()
  })

  test('does not migrate when keychain set throws', async () => {
    saveCredential('anthropic', { apiKey: 'sk-file' }, home)
    kc.failOnSet = true
    const got = await getCredentialAsync('anthropic', home, kc)
    expect(got?.apiKey).toBe('sk-file')
    expect(loadCredentials(home).providers.anthropic?.apiKey).toBe('sk-file')
  })

  test('returns null when both keychain and file miss', async () => {
    const got = await getCredentialAsync('anthropic', home, kc)
    expect(got).toBeNull()
  })
})

describe('clearCredentialAsync', () => {
  test('clears from keychain and file', async () => {
    await saveCredentialAsync('anthropic', { apiKey: 'a' }, home, kc)
    saveCredential('openai', { apiKey: 'o' }, home)
    expect(await clearCredentialAsync('anthropic', home, kc)).toBe(true)
    expect(await kc.getPassword(KEYCHAIN_SERVICE, 'anthropic')).toBeNull()
  })

  test('returns false when nothing to clear', async () => {
    expect(await clearCredentialAsync('anthropic', home, kc)).toBe(false)
  })

  test('clears file even when keychain is empty', async () => {
    saveCredential('openai', { apiKey: 'o' }, home)
    expect(await clearCredentialAsync('openai', home, kc)).toBe(true)
    expect(loadCredentials(home).providers.openai).toBeUndefined()
  })
})

describe('listCredentialProvidersAsync', () => {
  test('returns the union of keychain and file providers', async () => {
    await saveCredentialAsync('anthropic', { apiKey: 'a' }, home, kc)
    saveCredential('openai', { apiKey: 'o' }, home)
    const list = (await listCredentialProvidersAsync(home, kc)).slice().sort()
    expect(list).toEqual(['anthropic', 'openai'])
  })

  test('deduplicates providers present in both stores', async () => {
    await saveCredentialAsync('anthropic', { apiKey: 'a' }, home, kc)
    saveCredential('anthropic', { apiKey: 'old' }, home)
    expect(await listCredentialProvidersAsync(home, kc)).toEqual(['anthropic'])
  })
})

describe('resolveApiKeyAsync', () => {
  const original = { ...process.env }
  afterEach(() => {
    for (const k of ['ANTHROPIC_API_KEY']) delete process.env[k]
    Object.assign(process.env, original)
  })

  test('env wins over keychain and file', async () => {
    await saveCredentialAsync('anthropic', { apiKey: 'stored' }, home, kc)
    process.env['ANTHROPIC_API_KEY'] = 'from-env'
    const r = await resolveApiKeyAsync('anthropic', ['ANTHROPIC_API_KEY'], home, kc)
    expect(r).toEqual({ apiKey: 'from-env', source: 'env', envVar: 'ANTHROPIC_API_KEY' })
  })

  test('keychain returns source=keychain', async () => {
    await saveCredentialAsync('anthropic', { apiKey: 'sk-kc' }, home, kc)
    delete process.env['ANTHROPIC_API_KEY']
    const r = await resolveApiKeyAsync('anthropic', ['ANTHROPIC_API_KEY'], home, kc)
    expect(r).toEqual({ apiKey: 'sk-kc', source: 'keychain' })
  })

  test('file fallback returns source=file', async () => {
    saveCredential('anthropic', { apiKey: 'sk-file' }, home)
    kc.failOnSet = true
    delete process.env['ANTHROPIC_API_KEY']
    const r = await resolveApiKeyAsync('anthropic', ['ANTHROPIC_API_KEY'], home, kc)
    expect(r?.apiKey).toBe('sk-file')
    expect(r?.source).toBe('file')
  })

  test('returns null when env, keychain, and file all miss', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    expect(await resolveApiKeyAsync('anthropic', ['ANTHROPIC_API_KEY'], home, kc)).toBeNull()
  })
})
