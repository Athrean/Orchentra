import { buildAuthorizeUrl, captureLoopbackCode, generatePkce, generateState } from '../oauth-pkce'
import { getCredential, saveCredential, clearCredential, type StoredCredential } from '../credential-store'

// Public identifiers for Claude Pro/Max subscription OAuth. Both claw-code and
// claude-code-router use these — they are the installed-app constants.
const ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize'
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const DEFAULT_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const DEFAULT_SCOPES = ['org:create_api_key', 'user:profile', 'user:inference']

export interface AnthropicLoginOptions {
  readonly clientId?: string
  readonly scopes?: readonly string[]
  readonly onAuthUrl: (authUrl: string) => void | Promise<void>
  readonly timeoutMs?: number
  readonly persist?: boolean
}

export interface AnthropicLoginResult {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly expiresAt?: number
  readonly scopes: readonly string[]
  readonly persistedPath?: string
}

export async function loginAnthropic(options: AnthropicLoginOptions): Promise<AnthropicLoginResult> {
  const clientId = options.clientId ?? process.env['ANTHROPIC_OAUTH_CLIENT_ID'] ?? DEFAULT_CLIENT_ID
  const scopes = options.scopes ?? DEFAULT_SCOPES

  const pkce = generatePkce()
  const state = generateState()

  const server = await captureLoopbackCode({
    preferredPorts: [54545, 54546, 54547],
    timeoutMs: options.timeoutMs ?? 5 * 60_000,
    path: '/callback',
  })

  const authUrl = buildAuthorizeUrl(ANTHROPIC_AUTHORIZE_URL, {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: server.redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: pkce.method,
  })

  await options.onAuthUrl(authUrl)

  const captured = await server.waitForCode(state)
  const tokenResp = await exchangeCode({
    code: captured.code,
    redirectUri: server.redirectUri,
    verifier: pkce.verifier,
    clientId,
    state,
  })

  const credential: StoredCredential = {
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token,
    expiresAt: Date.now() + (tokenResp.expires_in ?? 3600) * 1000,
    scopes,
  }

  const persistedPath = options.persist === false ? undefined : saveCredential('anthropic', credential)

  return {
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token,
    expiresAt: credential.expiresAt,
    scopes,
    persistedPath,
  }
}

export async function resolveAnthropicAuthToken(): Promise<string | null> {
  // Env overrides
  const envToken = process.env['ANTHROPIC_AUTH_TOKEN']
  if (envToken && envToken.trim().length > 0) return envToken.trim()

  const stored = getCredential('anthropic')
  if (!stored) return null

  if (stored.accessToken && stored.expiresAt && stored.expiresAt > Date.now() + 30_000) {
    return stored.accessToken
  }

  if (stored.refreshToken) {
    const clientId = process.env['ANTHROPIC_OAUTH_CLIENT_ID'] ?? DEFAULT_CLIENT_ID
    try {
      const refreshed = await refreshToken({ refreshToken: stored.refreshToken, clientId })
      saveCredential('anthropic', {
        ...stored,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? stored.refreshToken,
        expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      })
      return refreshed.access_token
    } catch {
      return stored.accessToken ?? null
    }
  }

  return stored.accessToken ?? null
}

export function logoutAnthropic(): boolean {
  return clearCredential('anthropic')
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

async function exchangeCode(args: {
  code: string
  redirectUri: string
  verifier: string
  clientId: string
  state: string
}): Promise<TokenResponse> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: args.clientId,
      code_verifier: args.verifier,
      state: args.state,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`anthropic token exchange failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

async function refreshToken(args: { refreshToken: string; clientId: string }): Promise<TokenResponse> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken,
      client_id: args.clientId,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`anthropic token refresh failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}
