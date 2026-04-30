import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importClaudeCodeIfAvailable, resolveAnthropicAuthToken } from '../src/anthropic/oauth'
import { getCredential, saveCredential } from '../src/credential-store'
import { MacKeychain, type KeychainExec } from '../src/keychain'
import { CLAUDE_CODE_KEYCHAIN_SERVICE } from '../src/anthropic/claude-code-creds'

const ENV_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_OAUTH_CLIENT_ID',
  'ORCHENTRA_NO_CLAUDE_CODE_IMPORT',
] as const

function fakeKeychainExec(canned: Map<string, { code: number; stdout?: string }>): KeychainExec {
  return async (args) => {
    const r = canned.get(args.join(' ')) ?? { code: 1 }
    return { code: r.code, stdout: r.stdout ?? '', stderr: '' }
  }
}

function ccPayload(accessToken: string, refreshToken: string, expiresAt: number): string {
  return JSON.stringify({ claudeAiOauth: { accessToken, refreshToken, expiresAt } })
}

const emptyKeychain = new MacKeychain(async () => ({ code: 1, stdout: '', stderr: '' }))
let configHome: string
const snapshot: Record<string, string | undefined> = {}

beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), 'orchentra-oauth-'))
  process.env['ORCHENTRA_CONFIG_HOME'] = configHome
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  rmSync(configHome, { recursive: true, force: true })
  delete process.env['ORCHENTRA_CONFIG_HOME']
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k]
    else process.env[k] = snapshot[k]
  }
})

describe('resolveAnthropicAuthToken — precedence', () => {
  test('returns ANTHROPIC_AUTH_TOKEN when set', async () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-oat01-from-env'
    expect(await resolveAnthropicAuthToken()).toBe('sk-ant-oat01-from-env')
  })

  test('trims whitespace on ANTHROPIC_AUTH_TOKEN', async () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = '  sk-ant-oat01-padded  '
    expect(await resolveAnthropicAuthToken()).toBe('sk-ant-oat01-padded')
  })

  test('returns CLAUDE_CODE_OAUTH_TOKEN when ANTHROPIC_AUTH_TOKEN is unset', async () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-long-lived'
    expect(await resolveAnthropicAuthToken()).toBe('sk-ant-oat01-long-lived')
  })

  test('ANTHROPIC_AUTH_TOKEN wins over CLAUDE_CODE_OAUTH_TOKEN when both set', async () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-oat01-runtime'
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-long-lived'
    expect(await resolveAnthropicAuthToken()).toBe('sk-ant-oat01-runtime')
  })

  test('ignores CLAUDE_CODE_OAUTH_TOKEN when only whitespace', async () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '   '
    expect(await resolveAnthropicAuthToken({ keychain: emptyKeychain })).toBeNull()
  })

  test('falls through to stored credential when no env token set', async () => {
    saveCredential(
      'anthropic',
      {
        accessToken: 'sk-ant-oat01-stored',
        expiresAt: Date.now() + 60_000,
      },
      configHome,
    )
    expect(await resolveAnthropicAuthToken()).toBe('sk-ant-oat01-stored')
  })

  test('returns null when no creds available anywhere (env, file, or keychain)', async () => {
    expect(await resolveAnthropicAuthToken({ keychain: emptyKeychain })).toBeNull()
  })
})

describe('importClaudeCodeIfAvailable', () => {
  test('imports the Claude Code credential and persists it to Orchentra creds', async () => {
    const expires = Date.now() + 3_600_000
    const exec = fakeKeychainExec(
      new Map([
        [
          `find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`,
          { code: 0, stdout: ccPayload('sk-ant-oat01-CC', 'sk-ant-ort01-CC', expires) },
        ],
      ]),
    )
    const imported = await importClaudeCodeIfAvailable(new MacKeychain(exec))
    expect(imported?.accessToken).toBe('sk-ant-oat01-CC')
    expect(getCredential('anthropic', configHome)?.accessToken).toBe('sk-ant-oat01-CC')
  })

  test('returns null when Keychain holds no Claude Code entry', async () => {
    const exec = fakeKeychainExec(
      new Map([
        [`find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`, { code: 44 }],
        ['dump-keychain', { code: 0, stdout: '' }],
      ]),
    )
    expect(await importClaudeCodeIfAvailable(new MacKeychain(exec))).toBeNull()
    expect(getCredential('anthropic', configHome)).toBeNull()
  })

  test('honours ORCHENTRA_NO_CLAUDE_CODE_IMPORT opt-out', async () => {
    process.env['ORCHENTRA_NO_CLAUDE_CODE_IMPORT'] = '1'
    const exec = fakeKeychainExec(
      new Map([
        [
          `find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`,
          { code: 0, stdout: ccPayload('sk-ant-oat01-CC', 'r', Date.now() + 60_000) },
        ],
      ]),
    )
    expect(await importClaudeCodeIfAvailable(new MacKeychain(exec))).toBeNull()
  })
})

describe('resolveAnthropicAuthToken — Keychain fallback', () => {
  test('reads Claude Code Keychain when no env or stored creds', async () => {
    const expires = Date.now() + 3_600_000
    const exec = fakeKeychainExec(
      new Map([
        [
          `find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`,
          { code: 0, stdout: ccPayload('sk-ant-oat01-from-keychain', 'r', expires) },
        ],
      ]),
    )
    const token = await resolveAnthropicAuthToken({ keychain: new MacKeychain(exec) })
    expect(token).toBe('sk-ant-oat01-from-keychain')
  })

  test('skips Keychain when an Orchentra credential already exists', async () => {
    saveCredential('anthropic', { accessToken: 'sk-ant-oat01-stored-wins', expiresAt: Date.now() + 60_000 }, configHome)
    const exec = fakeKeychainExec(
      new Map([
        [
          `find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`,
          { code: 0, stdout: ccPayload('sk-ant-oat01-keychain-loser', 'r', Date.now() + 60_000) },
        ],
      ]),
    )
    expect(await resolveAnthropicAuthToken({ keychain: new MacKeychain(exec) })).toBe('sk-ant-oat01-stored-wins')
  })

  test('opt-out env disables Keychain fallback even with no stored creds', async () => {
    process.env['ORCHENTRA_NO_CLAUDE_CODE_IMPORT'] = '1'
    const exec = fakeKeychainExec(
      new Map([
        [
          `find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`,
          { code: 0, stdout: ccPayload('sk-ant-oat01-CC', 'r', Date.now() + 60_000) },
        ],
      ]),
    )
    expect(await resolveAnthropicAuthToken({ keychain: new MacKeychain(exec) })).toBeNull()
  })
})
