// Google Antigravity — the subscription sign-in that replaced Google's retired
// free coding tier. Two facts make it a separate module from `gemini/oauth`
// rather than a flag on it:
//
//   • Different OAuth client. The older installed-app client now gets
//     `UNSUPPORTED_CLIENT` back from loadCodeAssist ("please migrate to the
//     Antigravity suite"); the Antigravity client is onboarded normally. The
//     rejection was never about the account's eligibility.
//   • Different Code Assist host. Antigravity talks to
//     `daily-cloudcode-pa.googleapis.com`, not `cloudcode-pa.googleapis.com`.
//
// Both client id and secret below are the public installed-app credentials the
// Antigravity CLI ships; per Google's installed-app guidance a public client's
// secret is not a secret. Override either through the environment.

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildAuthorizeUrl, captureLoopbackCode, generatePkce, generateState } from '../oauth-pkce'
import { clearCredential, getCredential, saveCredential, type StoredCredential } from '../credential-store'
import { MacKeychain } from '../keychain'

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

const DEFAULT_CLIENT_ID = 'REDACTED-ANTIGRAVITY-CLIENT-ID'
const DEFAULT_CLIENT_SECRET = 'REDACTED-ANTIGRAVITY-CLIENT-SECRET'

/** Antigravity's Code Assist host. The `daily-` prefix is not a staging marker. */
export const ANTIGRAVITY_ENDPOINT = 'https://daily-cloudcode-pa.googleapis.com'

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

/**
 * The Antigravity CLI (`agy`) stores its credential as a macOS generic password
 * under this service/account pair, wrapped by the Go `keyring` library.
 */
export const ANTIGRAVITY_KEYCHAIN_SERVICE = 'gemini'
export const ANTIGRAVITY_KEYCHAIN_ACCOUNT = 'antigravity'
const GO_KEYRING_PREFIX = 'go-keyring-base64:'

/** `extra.source` marker distinguishing an imported CLI login from our own flow. */
export const ANTIGRAVITY_CLI_SOURCE = 'antigravity-cli-import'

function clientId(): string {
  return process.env['ANTIGRAVITY_OAUTH_CLIENT_ID'] ?? DEFAULT_CLIENT_ID
}

function clientSecret(): string {
  return process.env['ANTIGRAVITY_OAUTH_CLIENT_SECRET'] ?? DEFAULT_CLIENT_SECRET
}

export interface AntigravityLoginOptions {
  readonly onAuthUrl: (authUrl: string) => void | Promise<void>
  readonly timeoutMs?: number
  /** When false, tokens are returned but not written to the credential store. */
  readonly persist?: boolean
}

export interface AntigravityLoginResult {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly expiresAt?: number
  readonly accountEmail?: string
  readonly persistedPath?: string
}

/**
 * Full interactive loopback OAuth against the Antigravity client. Mirrors
 * `loginGemini`; the only differences are the client credentials and that the
 * resulting credential is stored under `antigravity`.
 */
export async function loginAntigravity(options: AntigravityLoginOptions): Promise<AntigravityLoginResult> {
  const pkce = generatePkce()
  const state = generateState()
  const server = await captureLoopbackCode({
    preferredPorts: [8976, 8977, 8978, 8979],
    timeoutMs: options.timeoutMs ?? 5 * 60_000,
  })

  const authUrl = buildAuthorizeUrl(GOOGLE_AUTHORIZE_URL, {
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: server.redirectUri,
    scope: DEFAULT_SCOPES.join(' '),
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: pkce.method,
    access_type: 'offline',
    prompt: 'consent',
  })
  await options.onAuthUrl(authUrl)

  const captured = await server.waitForCode(state)
  const tokens = await postToken({
    code: captured.code,
    redirect_uri: server.redirectUri,
    code_verifier: pkce.verifier,
    grant_type: 'authorization_code',
  })

  const accountEmail = await fetchUserEmail(tokens.access_token)
  const credential: StoredCredential = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    scopes: DEFAULT_SCOPES,
    ...(accountEmail ? { accountEmail } : {}),
  }
  const persistedPath = options.persist === false ? undefined : saveCredential('antigravity', credential)

  return {
    accessToken: tokens.access_token,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    ...(credential.expiresAt ? { expiresAt: credential.expiresAt } : {}),
    ...(accountEmail ? { accountEmail } : {}),
    ...(persistedPath ? { persistedPath } : {}),
  }
}

interface AntigravityCliToken {
  readonly access_token?: unknown
  readonly refresh_token?: unknown
  readonly expiry?: unknown
}

interface AntigravityCliCredential {
  readonly auth_method?: unknown
  readonly token?: AntigravityCliToken
}

/**
 * Unwrap what the Go `keyring` library wrote. It base64-encodes any value that
 * is not clean UTF-8 and prefixes it; a plain value is stored verbatim.
 */
export function unwrapGoKeyring(raw: string): string {
  if (!raw.startsWith(GO_KEYRING_PREFIX)) return raw
  return Buffer.from(raw.slice(GO_KEYRING_PREFIX.length), 'base64').toString('utf8')
}

export function parseAntigravityCliCredential(raw: string): StoredCredential | null {
  let parsed: AntigravityCliCredential
  try {
    parsed = JSON.parse(unwrapGoKeyring(raw)) as AntigravityCliCredential
  } catch {
    return null
  }
  const token = parsed.token
  const refreshToken = typeof token?.refresh_token === 'string' ? token.refresh_token : undefined
  const accessToken = typeof token?.access_token === 'string' ? token.access_token : undefined
  // A refresh token is the part worth importing: the access token in the CLI's
  // store is usually already expired, and we can always mint a new one.
  if (!refreshToken && !accessToken) return null
  const expiry = typeof token?.expiry === 'string' ? Date.parse(token.expiry) : NaN
  return {
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(Number.isFinite(expiry) ? { expiresAt: expiry } : {}),
    scopes: DEFAULT_SCOPES,
    extra: { source: ANTIGRAVITY_CLI_SOURCE },
  }
}

/**
 * Import an existing `agy auth login` from the macOS Keychain — the analogue of
 * `readClaudeCodeFromKeychain` and `importCodexCliAuth`, and the piece Gemini
 * was missing. Returns null when the CLI is not installed or not signed in.
 */
export async function importAntigravityCliAuth(
  opts: { persist?: boolean; keychain?: MacKeychain } = {},
): Promise<StoredCredential | null> {
  if (!MacKeychain.available()) return null
  const keychain = opts.keychain ?? new MacKeychain()
  const entry = await keychain.findGenericPassword(ANTIGRAVITY_KEYCHAIN_SERVICE, ANTIGRAVITY_KEYCHAIN_ACCOUNT)
  if (!entry) return null
  const credential = parseAntigravityCliCredential(entry.password)
  if (!credential) return null
  if (opts.persist !== false) saveCredential('antigravity', credential)
  return credential
}

/** Where the Antigravity CLI keeps its state; used only to detect an install. */
export function antigravityHome(): string {
  const override = process.env['ANTIGRAVITY_HOME']
  if (override && override.trim().length > 0) return override.trim()
  return join(homedir(), '.gemini', 'antigravity-cli')
}

export function isAntigravityCliInstalled(): boolean {
  return existsSync(antigravityHome())
}

/** True when a stored Antigravity credential should drive the gemini provider. */
export function isAntigravityLogin(): boolean {
  const stored = getCredential('antigravity')
  return Boolean(stored?.accessToken ?? stored?.refreshToken)
}

/**
 * Resolve a usable access token, refreshing through Google when the stored one
 * is expired or absent. Returns null when there is nothing to work with, so the
 * caller can fall back rather than throw.
 */
export async function resolveAntigravityAccessToken(): Promise<string | null> {
  const envToken = process.env['ANTIGRAVITY_OAUTH_TOKEN']
  if (envToken && envToken.trim().length > 0) return envToken.trim()

  const stored = getCredential('antigravity')
  if (!stored) return null
  if (stored.accessToken && stored.expiresAt && stored.expiresAt > Date.now() + 30_000) {
    return stored.accessToken
  }
  if (!stored.refreshToken) return stored.accessToken ?? null

  try {
    const refreshed = await postToken({ refresh_token: stored.refreshToken, grant_type: 'refresh_token' })
    saveCredential('antigravity', {
      ...stored,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    })
    return refreshed.access_token
  } catch {
    // A refresh failure is not fatal on its own — a still-valid access token is
    // better than nothing, and the provider surfaces the 401 if it is not.
    return stored.accessToken ?? null
  }
}

export function logoutAntigravity(): boolean {
  return clearCredential('antigravity')
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`antigravity token request failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

async function fetchUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return undefined
    return ((await res.json()) as { email?: string }).email
  } catch {
    return undefined
  }
}
