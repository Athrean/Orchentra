import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  credentialsPath,
  loadCredentials,
  getCredential,
  saveCredential,
  clearCredential,
  listCredentialProviders,
  resolveApiKey,
} from '../src/credential-store'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orchentra-cred-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('credentialsPath', () => {
  test('resolves under ~/.config/orchentra', () => {
    expect(credentialsPath(home)).toBe(join(home, '.config', 'orchentra', 'credentials.json'))
  })
})

describe('save + load roundtrip', () => {
  test('empty store loads as empty providers map', () => {
    const file = loadCredentials(home)
    expect(file.version).toBe(1)
    expect(file.providers).toEqual({})
  })

  test('saveCredential persists and getCredential returns it', () => {
    saveCredential('anthropic', { apiKey: 'sk-test' }, home)
    expect(getCredential('anthropic', home)).toEqual({ apiKey: 'sk-test' })
  })

  test('saveCredential preserves other providers', () => {
    saveCredential('anthropic', { apiKey: 'sk-a' }, home)
    saveCredential('gemini', { accessToken: 'ya29-test', expiresAt: 1234 }, home)
    expect(getCredential('anthropic', home)?.apiKey).toBe('sk-a')
    expect(getCredential('gemini', home)?.accessToken).toBe('ya29-test')
  })

  test('saveCredential overwrites same provider', () => {
    saveCredential('anthropic', { apiKey: 'old' }, home)
    saveCredential('anthropic', { apiKey: 'new' }, home)
    expect(getCredential('anthropic', home)?.apiKey).toBe('new')
  })

  test('file is written with 0600 permissions on POSIX', () => {
    if (process.platform === 'win32') return
    saveCredential('openai', { apiKey: 'sk-secret' }, home)
    const mode = statSync(credentialsPath(home)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('file contents are valid JSON', () => {
    saveCredential('github', { accessToken: 'gho_abc' }, home)
    const text = readFileSync(credentialsPath(home), 'utf8')
    expect(() => JSON.parse(text)).not.toThrow()
    expect(JSON.parse(text).providers.github.accessToken).toBe('gho_abc')
  })
})

describe('clearCredential', () => {
  test('returns false when provider absent', () => {
    expect(clearCredential('anthropic', home)).toBe(false)
  })

  test('returns true and removes when present', () => {
    saveCredential('anthropic', { apiKey: 'sk-x' }, home)
    expect(clearCredential('anthropic', home)).toBe(true)
    expect(getCredential('anthropic', home)).toBeNull()
  })

  test('does not remove other providers', () => {
    saveCredential('anthropic', { apiKey: 'a' }, home)
    saveCredential('gemini', { apiKey: 'g' }, home)
    clearCredential('anthropic', home)
    expect(getCredential('gemini', home)?.apiKey).toBe('g')
  })
})

describe('listCredentialProviders', () => {
  test('returns empty when no credentials stored', () => {
    expect(listCredentialProviders(home)).toEqual([])
  })

  test('lists all providers with stored creds', () => {
    saveCredential('anthropic', { apiKey: 'a' }, home)
    saveCredential('gemini', { accessToken: 'g' }, home)
    const list = listCredentialProviders(home)
    expect(list.sort()).toEqual(['anthropic', 'gemini'])
  })
})

describe('resolveApiKey', () => {
  const original = { ...process.env }
  afterEach(() => {
    for (const k of ['ANTHROPIC_API_KEY', 'TEST_KEY']) delete process.env[k]
    Object.assign(process.env, original)
  })

  test('env var takes precedence over stored', () => {
    saveCredential('anthropic', { apiKey: 'stored' }, home)
    process.env['ANTHROPIC_API_KEY'] = 'from-env'
    const r = resolveApiKey('anthropic', ['ANTHROPIC_API_KEY'], home)
    expect(r).toEqual({ apiKey: 'from-env', source: 'env', envVar: 'ANTHROPIC_API_KEY' })
  })

  test('falls through empty env to file', () => {
    saveCredential('anthropic', { apiKey: 'stored' }, home)
    process.env['ANTHROPIC_API_KEY'] = '   '
    const r = resolveApiKey('anthropic', ['ANTHROPIC_API_KEY'], home)
    expect(r).toEqual({ apiKey: 'stored', source: 'file' })
  })

  test('returns null when env and file miss', () => {
    delete process.env['ANTHROPIC_API_KEY']
    expect(resolveApiKey('anthropic', ['ANTHROPIC_API_KEY'], home)).toBeNull()
  })
})
