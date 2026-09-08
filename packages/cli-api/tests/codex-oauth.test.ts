import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildCodexAuthorizeUrl,
  completeCodexLogin,
  parseCodexIdToken,
  importCodexCliAuth,
  isCodexBackendLogin,
  resolveOpenAiApiKeyFromCodex,
  readCodexCliAuth,
  getCredential,
} from '../src/index'

// A JWT is header.payload.signature; only the payload is read. Sign-nothing is
// fine — parseCodexIdToken deliberately does not verify signatures (the token
// arrives over TLS straight from the token endpoint).
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64(payload)}.`
}

const ID_TOKEN = fakeJwt({
  email: 'dev@example.com',
  'https://api.openai.com/auth': {
    chatgpt_account_id: 'acc_123',
    chatgpt_plan_type: 'pro',
  },
})

describe('codex oauth', () => {
  const originalFetch = globalThis.fetch
  const originalConfigHome = process.env['XDG_CONFIG_HOME']
  const originalCodexHome = process.env['CODEX_HOME']
  let configHome: string

  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'codex-oauth-test-'))
    process.env['XDG_CONFIG_HOME'] = configHome
    delete process.env['CODEX_HOME']
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    rmSync(configHome, { recursive: true, force: true })
    if (originalConfigHome === undefined) delete process.env['XDG_CONFIG_HOME']
    else process.env['XDG_CONFIG_HOME'] = originalConfigHome
    if (originalCodexHome === undefined) delete process.env['CODEX_HOME']
    else process.env['CODEX_HOME'] = originalCodexHome
  })

  test('builds the ChatGPT authorize URL with PKCE + Codex params', () => {
    const url = new URL(
      buildCodexAuthorizeUrl({ redirectUri: 'http://localhost:1455/auth/callback', challenge: 'CHAL', state: 'ST' }),
    )
    expect(url.origin + url.pathname).toBe('https://auth.openai.com/oauth/authorize')
    const p = url.searchParams
    expect(p.get('response_type')).toBe('code')
    expect(p.get('client_id')).toBe('app_EMoamEEZ73f0CkXaXp7hrann')
    expect(p.get('redirect_uri')).toBe('http://localhost:1455/auth/callback')
    // Must be EXACTLY the Codex scope — extra scopes make the authorize page
    // 400 with "The string did not match the expected pattern".
    expect(p.get('scope')).toBe('openid profile email offline_access')
    expect(p.get('code_challenge')).toBe('CHAL')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('state')).toBe('ST')
    expect(p.get('originator')).toBe('codex_cli_rs')
    expect(p.get('codex_cli_simplified_flow')).toBe('true')
  })

  test('honours CODEX_OAUTH_CLIENT_ID override', () => {
    process.env['CODEX_OAUTH_CLIENT_ID'] = 'app_custom'
    try {
      const url = new URL(
        buildCodexAuthorizeUrl({ redirectUri: 'http://localhost:1455/auth/callback', challenge: 'c', state: 's' }),
      )
      expect(url.searchParams.get('client_id')).toBe('app_custom')
    } finally {
      delete process.env['CODEX_OAUTH_CLIENT_ID']
    }
  })

  test('parses account id, plan type, and email from the id_token', () => {
    expect(parseCodexIdToken(ID_TOKEN)).toEqual({ accountId: 'acc_123', planType: 'pro', email: 'dev@example.com' })
  })

  test('never throws on a malformed id_token', () => {
    expect(parseCodexIdToken('not-a-jwt')).toEqual({})
    expect(parseCodexIdToken('')).toEqual({})
  })

  test('exchanges the code for tokens, mints an api key, and stores it under openai', async () => {
    const bodies: Record<string, string>[] = []
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : ''
      const form = Object.fromEntries(new URLSearchParams(body))
      bodies.push(form)
      // First call: authorization_code → tokens. Second: token-exchange → key.
      if (form['grant_type'] === 'authorization_code') {
        return jsonResponse({ id_token: ID_TOKEN, access_token: 'acc_tok', refresh_token: 'ref_tok' })
      }
      return jsonResponse({ access_token: 'sk-codex-minted' })
    }) as typeof globalThis.fetch

    const result = await completeCodexLogin({
      code: 'authcode',
      verifier: 'verifier123',
      redirectUri: 'http://localhost:1455/auth/callback',
    })

    // Code exchange body.
    expect(bodies[0]).toMatchObject({
      grant_type: 'authorization_code',
      code: 'authcode',
      redirect_uri: 'http://localhost:1455/auth/callback',
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
      code_verifier: 'verifier123',
    })
    // Token-exchange (RFC 8693) body → openai-api-key.
    expect(bodies[1]).toMatchObject({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requested_token: 'openai-api-key',
      subject_token: ID_TOKEN,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    })

    expect(result.mode).toBe('api-key')
    expect(result.apiKey).toBe('sk-codex-minted')
    expect(result.planType).toBe('pro')
    expect(result.email).toBe('dev@example.com')

    // The minted key is the openai credential the existing provider reads.
    const stored = getCredential('openai')
    expect(stored?.apiKey).toBe('sk-codex-minted')
    expect(stored?.extra?.['source']).toBe('codex-oauth')
    expect(stored?.extra?.['account_id']).toBe('acc_123')
    // A minted key is NOT a ChatGPT-backend login.
    expect(isCodexBackendLogin()).toBe(false)
  })

  // Personal ChatGPT plans have no platform org: the api-key mint 401s/403s, and
  // — exactly like the official Codex CLI — we fall back to ChatGPT-backend mode
  // by persisting the OAuth tokens rather than failing the login.
  test.each([
    ['403', new Response('forbidden', { status: 403 })],
    [
      '401 missing organization_id',
      new Response(
        JSON.stringify({
          error: { message: 'Invalid ID token: missing organization_id', code: 'invalid_subject_token' },
        }),
        { status: 401 },
      ),
    ],
  ])('falls back to ChatGPT-backend mode when the api-key mint fails (%s)', async (_label, mintResponse) => {
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const form = Object.fromEntries(new URLSearchParams(typeof init?.body === 'string' ? init.body : ''))
      if (form['grant_type'] === 'authorization_code') {
        return jsonResponse({ id_token: ID_TOKEN, access_token: 'chatgpt-access', refresh_token: 'chatgpt-refresh' })
      }
      return (mintResponse as Response).clone()
    }) as typeof globalThis.fetch

    const result = await completeCodexLogin({
      code: 'c',
      verifier: 'v',
      redirectUri: 'http://localhost:1455/auth/callback',
    })

    expect(result.mode).toBe('chatgpt')
    expect(result.apiKey).toBeUndefined()

    // The OAuth access token is persisted (no apiKey) so the backend provider
    // can drive models. The source marker flips the provider factory over.
    const stored = getCredential('openai')
    expect(stored?.apiKey).toBeUndefined()
    expect(stored?.accessToken).toBe('chatgpt-access')
    expect(stored?.refreshToken).toBe('chatgpt-refresh')
    expect(stored?.extra?.['source']).toBe('codex-chatgpt')
    expect(stored?.extra?.['account_id']).toBe('acc_123')
    expect(isCodexBackendLogin()).toBe(true)
  })

  test('imports an existing Codex CLI login from auth.json', () => {
    const codexHomeDir = mkdtempSync(join(tmpdir(), 'codex-home-'))
    process.env['CODEX_HOME'] = codexHomeDir
    writeFileSync(
      join(codexHomeDir, 'auth.json'),
      JSON.stringify({
        OPENAI_API_KEY: 'sk-from-codex-cli',
        auth_mode: 'chatgpt',
        tokens: { access_token: 'a', refresh_token: 'r', account_id: 'acc_9' },
      }),
    )
    try {
      expect(readCodexCliAuth()?.OPENAI_API_KEY).toBe('sk-from-codex-cli')
      const key = importCodexCliAuth()
      expect(key).toBe('sk-from-codex-cli')
      const stored = getCredential('openai')
      expect(stored?.apiKey).toBe('sk-from-codex-cli')
      expect(stored?.extra?.['source']).toBe('codex-cli-import')
    } finally {
      rmSync(codexHomeDir, { recursive: true, force: true })
    }
  })

  test('import returns null when no Codex login exists', () => {
    process.env['CODEX_HOME'] = mkdtempSync(join(tmpdir(), 'codex-empty-'))
    expect(importCodexCliAuth()).toBeNull()
  })

  test('resolveOpenAiApiKeyFromCodex prefers the stored credential over the CLI import', () => {
    const codexHomeDir = mkdtempSync(join(tmpdir(), 'codex-home-'))
    process.env['CODEX_HOME'] = codexHomeDir
    writeFileSync(join(codexHomeDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-cli' }))
    try {
      // No stored credential yet → falls back to the CLI import.
      expect(resolveOpenAiApiKeyFromCodex()).toBe('sk-cli')
      // Stored credential wins once present.
      importCodexCliAuth() // seeds store from CLI with sk-cli
      writeFileSync(join(codexHomeDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-cli-changed' }))
      expect(resolveOpenAiApiKeyFromCodex()).toBe('sk-cli')
    } finally {
      rmSync(codexHomeDir, { recursive: true, force: true })
    }
  })
})

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
}
