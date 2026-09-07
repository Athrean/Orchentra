import { describe, expect, test } from 'bun:test'
import {
  parseAntigravityCliCredential,
  unwrapGoKeyring,
  ANTIGRAVITY_CLI_SOURCE,
  ANTIGRAVITY_ENDPOINT,
} from '../src/gemini/antigravity'
import { MacKeychain } from '../src/keychain'

/** Shape the Antigravity CLI actually writes, minus the token values. */
function cliPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    auth_method: 'consumer',
    id_token: 'header.payload.sig',
    token: {
      access_token: 'ya29.access',
      token_type: 'Bearer',
      refresh_token: '1//refresh',
      expiry: '2026-08-01T00:00:00Z',
      ...overrides,
    },
  })
}

function wrapped(raw: string): string {
  return `go-keyring-base64:${Buffer.from(raw, 'utf8').toString('base64')}`
}

describe('unwrapGoKeyring', () => {
  test('decodes the base64 wrapper the Go keyring library adds', () => {
    expect(unwrapGoKeyring(wrapped('{"a":1}'))).toBe('{"a":1}')
  })

  test('passes an unwrapped value through untouched', () => {
    expect(unwrapGoKeyring('{"a":1}')).toBe('{"a":1}')
  })
})

describe('parseAntigravityCliCredential', () => {
  test('reads tokens and expiry out of a wrapped payload', () => {
    const cred = parseAntigravityCliCredential(wrapped(cliPayload()))
    expect(cred?.accessToken).toBe('ya29.access')
    expect(cred?.refreshToken).toBe('1//refresh')
    expect(cred?.expiresAt).toBe(Date.parse('2026-08-01T00:00:00Z'))
    expect(cred?.extra?.['source']).toBe(ANTIGRAVITY_CLI_SOURCE)
  })

  test('reads an unwrapped payload too', () => {
    expect(parseAntigravityCliCredential(cliPayload())?.refreshToken).toBe('1//refresh')
  })

  test('keeps a refresh-only credential — the access token is usually stale', () => {
    const raw = JSON.stringify({ auth_method: 'consumer', token: { refresh_token: '1//refresh' } })
    const cred = parseAntigravityCliCredential(raw)
    expect(cred?.refreshToken).toBe('1//refresh')
    expect(cred?.accessToken).toBeUndefined()
  })

  test('drops a malformed expiry rather than storing NaN', () => {
    const cred = parseAntigravityCliCredential(cliPayload({ expiry: 'not-a-date' }))
    expect(cred?.refreshToken).toBe('1//refresh')
    expect(cred?.expiresAt).toBeUndefined()
  })

  test('returns null for non-JSON, an empty token, or a missing token', () => {
    expect(parseAntigravityCliCredential('not json')).toBeNull()
    expect(parseAntigravityCliCredential(JSON.stringify({ auth_method: 'consumer', token: {} }))).toBeNull()
    expect(parseAntigravityCliCredential(JSON.stringify({ auth_method: 'consumer' }))).toBeNull()
  })
})

describe('keychain lookup', () => {
  test('asks for the service/account pair the Antigravity CLI writes', async () => {
    const calls: string[][] = []
    const keychain = new MacKeychain(async (args) => {
      calls.push([...args])
      return { code: 0, stdout: `${wrapped(cliPayload())}\n`, stderr: '' }
    })
    const entry = await keychain.findGenericPassword('gemini', 'antigravity')
    expect(calls[0]).toEqual(['find-generic-password', '-s', 'gemini', '-a', 'antigravity', '-w'])
    expect(parseAntigravityCliCredential(entry?.password ?? '')?.refreshToken).toBe('1//refresh')
  })

  test('a missing item is null, not a throw', async () => {
    const keychain = new MacKeychain(async () => ({ code: 44, stdout: '', stderr: 'not found' }))
    expect(await keychain.findGenericPassword('gemini', 'antigravity')).toBeNull()
  })
})

describe('endpoint', () => {
  // Antigravity is served from the `daily-` host; the plain cloudcode-pa host
  // is the retired one. Getting this wrong reads as a 403.
  test('points at the Antigravity Code Assist host', () => {
    expect(ANTIGRAVITY_ENDPOINT).toBe('https://daily-cloudcode-pa.googleapis.com')
  })
})
