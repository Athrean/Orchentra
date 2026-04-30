import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAnthropicAuthToken } from '../src/anthropic/oauth'
import { saveCredential } from '../src/credential-store'

const ENV_KEYS = ['ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_OAUTH_CLIENT_ID'] as const
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
    expect(await resolveAnthropicAuthToken()).toBeNull()
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

  test('returns null when nothing set anywhere', async () => {
    expect(await resolveAnthropicAuthToken()).toBeNull()
  })
})
