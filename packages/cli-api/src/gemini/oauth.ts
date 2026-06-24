import { buildAuthorizeUrl, captureLoopbackCode, generatePkce, generateState } from '../oauth-pkce'
import { getCredential, saveCredential, clearCredential, type StoredCredential } from '../credential-store'

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Installed-app client ID published in Google's open-source CLI tree. OK to ship
// per Google's installed-app guidance (client secret is not a secret for public clients).
const DEFAULT_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com'
const DEFAULT_CLIENT_SECRET = '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'

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export interface GeminiLoginOptions {
  readonly clientId?: string
  readonly clientSecret?: string
  readonly scopes?: readonly string[]
  readonly onAuthUrl: (authUrl: string) => void | Promise<void>
  readonly timeoutMs?: number
  readonly persist?: boolean
}

export interface GeminiLoginResult {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly expiresAt?: number
  readonly scopes: readonly string[]
  readonly accountEmail?: string
  readonly persistedPath?: string
}

export async function loginGemini(options: GeminiLoginOptions): Promise<GeminiLoginResult> {
  const clientId = options.clientId ?? process.env['GEMINI_OAUTH_CLIENT_ID'] ?? DEFAULT_CLIENT_ID
  const clientSecret = options.clientSecret ?? process.env['GEMINI_OAUTH_CLIENT_SECRET'] ?? DEFAULT_CLIENT_SECRET
  const scopes = options.scopes ?? DEFAULT_SCOPES

  const pkce = generatePkce()
  const state = generateState()

  const server = await captureLoopbackCode({
    preferredPorts: [8976, 8977, 8978, 8979],
    timeoutMs: options.timeoutMs ?? 5 * 60_000,
  })

  const authUrl = buildAuthorizeUrl(GOOGLE_AUTHORIZE_URL, {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: server.redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: pkce.method,
    access_type: 'offline',
    prompt: 'consent',
  })

  await options.onAuthUrl(authUrl)

  const captured = await server.waitForCode(state)
  const tokenResp = await exchangeCode({
    code: captured.code,
    redirectUri: server.redirectUri,
    verifier: pkce.verifier,
    clientId,
    clientSecret,
  })

  const accountEmail = await fetchUserEmail(tokenResp.access_token).catch(() => undefined)

  const credential: StoredCredential = {
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token,
    expiresAt: Date.now() + (tokenResp.expires_in ?? 3600) * 1000,
    scopes,
    accountEmail,
  }

  const persistedPath = options.persist === false ? undefined : saveCredential('gemini', credential)

  return {
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token,
    expiresAt: credential.expiresAt,
    scopes,
    accountEmail,
    persistedPath,
  }
}

export async function resolveGeminiAccessToken(): Promise<string | null> {
  // Env var takes precedence
  const envToken = process.env['GEMINI_OAUTH_TOKEN']
  if (envToken && envToken.trim().length > 0) return envToken.trim()

  const stored = getCredential('gemini')
  if (!stored) return null

  // Still valid?
  if (stored.accessToken && stored.expiresAt && stored.expiresAt > Date.now() + 30_000) {
    return stored.accessToken
  }

  // Try refresh
  if (stored.refreshToken) {
    const clientId = process.env['GEMINI_OAUTH_CLIENT_ID'] ?? DEFAULT_CLIENT_ID
    const clientSecret = process.env['GEMINI_OAUTH_CLIENT_SECRET'] ?? DEFAULT_CLIENT_SECRET
    try {
      const refreshed = await refreshToken({
        refreshToken: stored.refreshToken,
        clientId,
        clientSecret,
      })
      saveCredential('gemini', {
        ...stored,
        accessToken: refreshed.access_token,
        expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      })
      return refreshed.access_token
    } catch {
      return stored.accessToken ?? null
    }
  }

  return stored.accessToken ?? null
}

export function logoutGemini(): boolean {
  return clearCredential('gemini')
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
  clientSecret: string
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: args.verifier,
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`google token exchange failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

async function refreshToken(args: {
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    refresh_token: args.refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`google token refresh failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

async function fetchUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return undefined
    const body = (await res.json()) as { email?: string }
    return body.email
  } catch {
    return undefined
  }
}
