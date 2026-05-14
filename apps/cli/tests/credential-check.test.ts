import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveCredential, type KeychainShim, KEYCHAIN_SERVICE } from '@orchentra/cli-api'
import { hasAnyLlmCredential, listLlmProvidersWithCreds, LLM_PROVIDER_ENV_VARS } from '../src/auth/credential-check'

class InMemoryKeychain implements KeychainShim {
  private store = new Map<string, string>()
  async getPassword(service: string, account: string): Promise<string | null> {
    return this.store.get(`${service}::${account}`) ?? null
  }
  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.store.set(`${service}::${account}`, password)
  }
  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.store.delete(`${service}::${account}`)
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
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'XAI_API_KEY', 'GEMINI_API_KEY']

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orchentra-credcheck-'))
  kc = new InMemoryKeychain()
  for (const k of ENV_KEYS) delete process.env[k]
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('LLM_PROVIDER_ENV_VARS', () => {
  test('covers the supported LLM providers', () => {
    expect(LLM_PROVIDER_ENV_VARS).toHaveProperty('anthropic')
    expect(LLM_PROVIDER_ENV_VARS).toHaveProperty('openai')
    expect(LLM_PROVIDER_ENV_VARS).toHaveProperty('xai')
    expect(LLM_PROVIDER_ENV_VARS).toHaveProperty('gemini')
  })
})

describe('hasAnyLlmCredential', () => {
  test('returns false when nothing configured', async () => {
    expect(await hasAnyLlmCredential(home, kc)).toBe(false)
  })

  test('returns true when env var is set', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-from-env'
    expect(await hasAnyLlmCredential(home, kc)).toBe(true)
  })

  test('returns true when keychain has a stored key', async () => {
    await kc.setPassword(KEYCHAIN_SERVICE, 'openai', JSON.stringify({ apiKey: 'sk-x' }))
    expect(await hasAnyLlmCredential(home, kc)).toBe(true)
  })

  test('returns true when plaintext file has a stored key', async () => {
    saveCredential('xai', { apiKey: 'xai-x' }, home)
    expect(await hasAnyLlmCredential(home, kc)).toBe(true)
  })

  test('returns true when OAuth token persists for anthropic', async () => {
    saveCredential('anthropic', { accessToken: 'oat-1', refreshToken: 'rt-1', expiresAt: Date.now() + 10000 }, home)
    expect(await hasAnyLlmCredential(home, kc)).toBe(true)
  })

  test('ignores whitespace-only env values', async () => {
    process.env['OPENAI_API_KEY'] = '   '
    expect(await hasAnyLlmCredential(home, kc)).toBe(false)
  })

  test('ignores github credentials (not an LLM provider)', async () => {
    saveCredential('github', { accessToken: 'gho-x' }, home)
    expect(await hasAnyLlmCredential(home, kc)).toBe(false)
  })
})

describe('listLlmProvidersWithCreds', () => {
  test('lists providers across env, keychain, and file', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-a'
    await kc.setPassword(KEYCHAIN_SERVICE, 'openai', JSON.stringify({ apiKey: 'sk-o' }))
    saveCredential('xai', { apiKey: 'xai' }, home)
    const list = (await listLlmProvidersWithCreds(home, kc)).slice().sort()
    expect(list).toEqual(['anthropic', 'openai', 'xai'])
  })

  test('deduplicates providers present in multiple stores', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-a'
    saveCredential('anthropic', { apiKey: 'sk-file' }, home)
    expect(await listLlmProvidersWithCreds(home, kc)).toEqual(['anthropic'])
  })
})
