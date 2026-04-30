import { buildAuthorizeUrl, generatePkce } from '../oauth-pkce'
import { getCredential, saveCredential, clearCredential, type StoredCredential } from '../credential-store'

// Installed-app OAuth client shared with Claude Code, opencode, and codebuff.
// The client is registered only with the paste-back redirect below — any loopback
// URI is rejected with "Invalid request format". The `code=true` param tells
// claude.ai to render the auth code on the callback page for copy-paste.
// NOTE: `state` is intentionally set equal to the PKCE verifier (opencode/codebuff
// convention) — the callback page returns "code#state", the user pastes the whole
// string back, and we send both `state` and `code_verifier` in the token exchange.
const ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize'
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'
const DEFAULT_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const DEFAULT_SCOPES = ['org:create_api_key', 'user:profile', 'user:inference']

export interface AnthropicLoginOptions {
  readonly clientId?: string
  readonly scopes?: readonly string[]
  readonly onAuthUrl: (authUrl: string) => void | Promise<void>
  readonly promptForCode: () => Promise<string>
  readonly persist?: boolean
}

export interface AnthropicLoginResult {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly expiresAt?: number
  readonly scopes: readonly string[]
  readonly persistedPath?: string
}

export interface AnthropicPendingLogin {
  readonly authUrl: string
  readonly verifier: string
  readonly clientId: string
  readonly scopes: readonly string[]
}

export function startAnthropicLogin(options?: {
  clientId?: string
  scopes?: readonly string[]
}): AnthropicPendingLogin {
  const clientId = options?.clientId ?? process.env['ANTHROPIC_OAUTH_CLIENT_ID'] ?? DEFAULT_CLIENT_ID
  const scopes = options?.scopes ?? DEFAULT_SCOPES
  const pkce = generatePkce()
  const authUrl = buildAuthorizeUrl(ANTHROPIC_AUTHORIZE_URL, {
    code: 'true',
    client_id: clientId,
    response_type: 'code',
    redirect_uri: ANTHROPIC_REDIRECT_URI,
    scope: scopes.join(' '),
    code_challenge: pkce.challenge,
    code_challenge_method: pkce.method,
    state: pkce.verifier,
  })
  return { authUrl, verifier: pkce.verifier, clientId, scopes }
}

export async function completeAnthropicLogin(args: {
  pasted: string
  verifier: string
  clientId?: string
  scopes?: readonly string[]
  persist?: boolean
}): Promise<AnthropicLoginResult> {
  const clientId = args.clientId ?? process.env['ANTHROPIC_OAUTH_CLIENT_ID'] ?? DEFAULT_CLIENT_ID
  const scopes = args.scopes ?? DEFAULT_SCOPES
  const trimmed = args.pasted.trim()
  if (!trimmed) throw new Error('no authorization code provided')

  const parts = trimmed.split('#')
  const code = parts[0]
  const state = parts[1] ?? args.verifier

  const tokenResp = await exchangeCode({ code, state, verifier: args.verifier, clientId })

  const credential: StoredCredential = {
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token,
    expiresAt: Date.now() + (tokenResp.expires_in ?? 3600) * 1000,
    scopes,
  }
  const persistedPath = args.persist === false ? undefined : saveCredential('anthropic', credential)
  return {
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token,
    expiresAt: credential.expiresAt,
    scopes,
    persistedPath,
  }
}

export async function loginAnthropic(options: AnthropicLoginOptions): Promise<AnthropicLoginResult> {
  const pending = startAnthropicLogin({ clientId: options.clientId, scopes: options.scopes })
  await options.onAuthUrl(pending.authUrl)
  const pasted = await options.promptForCode()
  return completeAnthropicLogin({
    pasted,
    verifier: pending.verifier,
    clientId: pending.clientId,
    scopes: pending.scopes,
    persist: options.persist,
  })
}

export async function resolveAnthropicAuthToken(): Promise<string | null> {
  const envToken = process.env['ANTHROPIC_AUTH_TOKEN']
  if (envToken && envToken.trim().length > 0) return envToken.trim()

  // Long-lived OAuth token from `claude setup-token` (1-year lifetime). Same
  // shape as a runtime ANTHROPIC_AUTH_TOKEN — no refresh needed, just inject
  // as the bearer. Matches Claude Code's own resolution precedence.
  const longLivedToken = process.env['CLAUDE_CODE_OAUTH_TOKEN']
  if (longLivedToken && longLivedToken.trim().length > 0) return longLivedToken.trim()

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
  state: string
  verifier: string
  clientId: string
}): Promise<TokenResponse> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: args.code,
      state: args.state,
      grant_type: 'authorization_code',
      client_id: args.clientId,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      code_verifier: args.verifier,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`token exchange failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

async function refreshToken(args: { refreshToken: string; clientId: string }): Promise<TokenResponse> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken,
      client_id: args.clientId,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`token refresh failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}
