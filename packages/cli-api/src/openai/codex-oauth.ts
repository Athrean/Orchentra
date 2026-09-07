import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildAuthorizeUrl, captureLoopbackCode, generatePkce, generateState } from '../oauth-pkce'
import { clearCredential, getCredential, saveCredential, type StoredCredential } from '../credential-store'

// "Sign in with ChatGPT" — the same public installed-app OAuth client the
// official Codex CLI uses (openai/codex → codex-rs/login/src/server.rs). Two
// outcomes, exactly mirroring Codex:
//   • Plans WITH a platform organization: the login is exchanged (RFC 8693
//     token-exchange) for a normal OpenAI API key, which plugs straight into
//     the existing OpenAI provider.
//   • Plans WITHOUT one (personal ChatGPT Plus/Pro): no key can be minted, so
//     we persist the OAuth tokens and drive models through the ChatGPT backend
//     (Responses API) with the access token — see CodexBackendProvider. Codex
//     treats the key-mint as best-effort (`obtain_api_key(...).ok()`) for the
//     same reason.
// This is the analogue of the Anthropic OAuth flow (Claude Pro/Max → bearer).
//
// All constants below are verified against openai/codex; the client id is a
// public identifier, overridable via CODEX_OAUTH_CLIENT_ID.
const CODEX_ISSUER = 'https://auth.openai.com'
const CODEX_AUTHORIZE_URL = `${CODEX_ISSUER}/oauth/authorize`
const CODEX_TOKEN_URL = `${CODEX_ISSUER}/oauth/token`
const DEFAULT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
// EXACTLY the scope the official Codex CLI requests. The authorize endpoint
// validates the simplified-flow request against a strict schema; extra scopes
// (e.g. api.connectors.*) make auth.openai.com reject it with "The string did
// not match the expected pattern" on page load.
const CODEX_SCOPES = 'openid profile email offline_access'
// Codex tags its OAuth + API traffic with this originator; the authorize page
// expects it for the simplified CLI flow.
const CODEX_ORIGINATOR = 'codex_cli_rs'
const CALLBACK_PATH = '/auth/callback'
// `extra.source` marker on the stored `openai` credential that tells the
// provider factory to route through the ChatGPT backend rather than the
// standard OpenAI API-key provider.
export const CODEX_CHATGPT_SOURCE = 'codex-chatgpt'
// Only the loopback ports the Codex client registers. OpenAI follows RFC 8252
// loopback rules (any localhost port is accepted), but preferring these keeps
// parity with the official flow.
const PREFERRED_PORTS = [1455, 1457]
const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange'
const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token'
const DEFAULT_TIMEOUT_MS = 5 * 60_000

const SUCCESS_HTML =
  '<html><body style="font-family:sans-serif;padding:40px">' +
  '<h2>✓ Signed in to OpenAI</h2><p>You can close this tab and return to the terminal.</p></body></html>'

function clientId(): string {
  return process.env['CODEX_OAUTH_CLIENT_ID'] ?? DEFAULT_CLIENT_ID
}

export interface CodexClaims {
  readonly accountId?: string
  readonly planType?: string
  readonly email?: string
}

export interface CodexLoginResult extends CodexClaims {
  /**
   * `api-key` — a platform key was minted (plans with a platform org); plugs
   * into the standard OpenAI provider. `chatgpt` — no key available, so models
   * run through the ChatGPT backend using the stored OAuth access token.
   */
  readonly mode: 'api-key' | 'chatgpt'
  /** Present only in `api-key` mode. */
  readonly apiKey?: string
  readonly accessToken: string
  readonly refreshToken: string
  readonly persistedPath?: string
}

export interface CodexLoginOptions {
  /** Called with the authorize URL so the caller can open a browser. */
  readonly onAuthUrl: (url: string) => void | Promise<void>
  readonly timeoutMs?: number
  /** When false, tokens are returned but not written to the credential store. */
  readonly persist?: boolean
}

/**
 * Full interactive loopback OAuth: spins a localhost callback server, hands the
 * caller the authorize URL to open, waits for the redirect, then exchanges the
 * code for tokens and mints an OpenAI API key. Mirrors `loginGemini`.
 */
export async function loginCodex(options: CodexLoginOptions): Promise<CodexLoginResult> {
  const pkce = generatePkce()
  const state = generateState()
  const loopback = await captureLoopbackCode({
    preferredPorts: PREFERRED_PORTS,
    path: CALLBACK_PATH,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    successHtml: SUCCESS_HTML,
  })
  // The Codex OAuth client only has these loopback ports registered as valid
  // redirect URIs; a random fallback port would be rejected by auth.openai.com.
  const boundPort = Number(new URL(loopback.redirectUri).port)
  if (!PREFERRED_PORTS.includes(boundPort)) {
    loopback.close()
    throw new Error(
      `Sign-in needs local port ${PREFERRED_PORTS.join(' or ')} free (both are in use). ` +
        'Close whatever is using them — e.g. a running `codex` login — and retry.',
    )
  }
  try {
    const authUrl = buildCodexAuthorizeUrl({
      redirectUri: loopback.redirectUri,
      challenge: pkce.challenge,
      state,
    })
    await options.onAuthUrl(authUrl)
    const { code, redirectUri } = await loopback.waitForCode(state)
    return await completeCodexLogin({
      code,
      verifier: pkce.verifier,
      redirectUri,
      persist: options.persist,
    })
  } catch (err) {
    loopback.close()
    throw err
  }
}

/** Build the "Sign in with ChatGPT" authorize URL. Pure — testable. */
export function buildCodexAuthorizeUrl(args: { redirectUri: string; challenge: string; state: string }): string {
  return buildAuthorizeUrl(CODEX_AUTHORIZE_URL, {
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: args.redirectUri,
    scope: CODEX_SCOPES,
    code_challenge: args.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state: args.state,
    originator: CODEX_ORIGINATOR,
  })
}

/**
 * Exchange an authorization code for tokens, then EITHER mint an OpenAI API key
 * (plans with a platform org) OR persist the OAuth tokens for the ChatGPT
 * backend (personal plans). Persists the `openai` credential by default.
 */
export async function completeCodexLogin(args: {
  code: string
  verifier: string
  redirectUri: string
  persist?: boolean
}): Promise<CodexLoginResult> {
  const tokens = await exchangeCodeForTokens(args)
  const claims = parseCodexIdToken(tokens.id_token)
  const persist = args.persist !== false

  // Best-effort platform key. A personal ChatGPT Plus/Pro plan has no platform
  // organization and 401s here ("missing organization_id") — that is expected,
  // not an error, so we swallow it and fall through to ChatGPT-backend mode.
  let apiKey: string | undefined
  try {
    apiKey = await obtainApiKey(tokens.id_token)
  } catch {
    apiKey = undefined
  }

  let persistedPath: string | undefined
  if (apiKey) {
    // api-key mode — plugs into the standard OpenAI API-key provider.
    const credential: StoredCredential = {
      apiKey,
      accountEmail: claims.email,
      extra: pruneUndefined({ source: 'codex-oauth', account_id: claims.accountId, plan_type: claims.planType }),
    }
    persistedPath = persist ? saveCredential('openai', credential) : undefined
  } else if (persist) {
    // chatgpt mode — the access token drives the ChatGPT backend directly.
    persistedPath = saveChatgptBackendCredential(tokens, claims)
  }

  return {
    mode: apiKey ? 'api-key' : 'chatgpt',
    apiKey,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accountId: claims.accountId,
    planType: claims.planType,
    email: claims.email,
    persistedPath,
  }
}

interface CodexTokenResponse {
  id_token: string
  access_token: string
  refresh_token: string
}

/** Persist ChatGPT-backend OAuth tokens as the `openai` credential (no apiKey). */
function saveChatgptBackendCredential(tokens: CodexTokenResponse, claims: CodexClaims): string {
  return saveCredential('openai', {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: jwtExpiryMs(tokens.access_token),
    accountEmail: claims.email,
    extra: pruneUndefined({
      source: CODEX_CHATGPT_SOURCE,
      account_id: claims.accountId,
      plan_type: claims.planType,
    }),
  })
}

async function exchangeCodeForTokens(args: {
  code: string
  verifier: string
  redirectUri: string
}): Promise<CodexTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: clientId(),
    code_verifier: args.verifier,
  })
  const res = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`codex token exchange failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as CodexTokenResponse
}

/**
 * Refresh a ChatGPT access token from its refresh token. OpenAI returns a fresh
 * id_token + access_token (and usually a rotated refresh_token). Used by the
 * ChatGPT-backend provider when the stored access token is near/at expiry.
 */
export async function refreshCodexTokens(refreshToken: string): Promise<CodexTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId(),
    refresh_token: refreshToken,
    scope: 'openid profile email',
  })
  const res = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`codex token refresh failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as CodexTokenResponse
}

export interface CodexBackendAuth {
  readonly accessToken: string
  readonly accountId?: string
}

/** True when the stored `openai` login drives the ChatGPT backend (no api key). */
export function isCodexBackendLogin(): boolean {
  const cred = getCredential('openai')
  return cred?.extra?.['source'] === CODEX_CHATGPT_SOURCE && !!cred.accessToken
}

/**
 * Resolve a usable ChatGPT-backend access token, refreshing (and re-persisting)
 * proactively when it is within a minute of expiry, or when `forceRefresh` is
 * set (used to retry once after a 401). Returns null when the stored login is
 * not a ChatGPT-backend login.
 */
export async function resolveCodexBackendAuth(opts: { forceRefresh?: boolean } = {}): Promise<CodexBackendAuth | null> {
  const cred = getCredential('openai')
  if (cred?.extra?.['source'] !== CODEX_CHATGPT_SOURCE || !cred.accessToken) return null

  const nearExpiry = typeof cred.expiresAt === 'number' && cred.expiresAt - Date.now() < 60_000
  if ((opts.forceRefresh || nearExpiry) && cred.refreshToken) {
    try {
      const refreshed = await refreshCodexTokens(cred.refreshToken)
      const claims = parseCodexIdToken(refreshed.id_token)
      const accountId = claims.accountId ?? cred.extra?.['account_id']
      saveCredential('openai', {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || cred.refreshToken,
        expiresAt: jwtExpiryMs(refreshed.access_token),
        accountEmail: claims.email ?? cred.accountEmail,
        extra: pruneUndefined({
          source: CODEX_CHATGPT_SOURCE,
          account_id: accountId,
          plan_type: claims.planType ?? cred.extra?.['plan_type'],
        }),
      })
      return { accessToken: refreshed.access_token, accountId }
    } catch {
      // Refresh failed — fall back to the existing token. If it is genuinely
      // expired the request will 401 and surface honestly (no silent success).
    }
  }
  return { accessToken: cred.accessToken, accountId: cred.extra?.['account_id'] }
}

/** Read a JWT's `exp` claim as epoch-ms, or undefined when unreadable. */
function jwtExpiryMs(token: string): number | undefined {
  try {
    const payload = token.split('.')[1]
    if (!payload) return undefined
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return typeof json.exp === 'number' ? json.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

/**
 * RFC 8693 token-exchange: swap the ChatGPT id_token for a usable OpenAI API
 * key (`requested_token=openai-api-key`). This is what lets a ChatGPT Plus/Pro
 * login with platform API access drive the standard OpenAI API.
 */
async function obtainApiKey(idToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: TOKEN_EXCHANGE_GRANT,
    client_id: clientId(),
    requested_token: 'openai-api-key',
    subject_token: idToken,
    subject_token_type: ID_TOKEN_TYPE,
  })
  const res = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`codex api-key exchange failed (${res.status}): ${text.slice(0, 300)}`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('codex api-key exchange returned no access_token')
  return json.access_token
}

/**
 * Decode the ChatGPT id_token (a JWT) to read the account id, plan type, and
 * email. Best-effort and defensive — never throws; unreadable tokens yield {}.
 * We only read claims; the signature is not verified here because the token was
 * just delivered over TLS from the OpenAI token endpoint.
 */
export function parseCodexIdToken(idToken: string): CodexClaims {
  try {
    const payload = idToken.split('.')[1]
    if (!payload) return {}
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    const auth = (json['https://api.openai.com/auth'] ?? {}) as Record<string, unknown>
    const profile = (json['https://api.openai.com/profile'] ?? {}) as Record<string, unknown>
    return {
      accountId: asString(auth['chatgpt_account_id']),
      planType: asString(auth['chatgpt_plan_type']),
      email: asString(json['email']) ?? asString(profile['email']),
    }
  } catch {
    return {}
  }
}

interface CodexAuthDotJson {
  OPENAI_API_KEY?: string
  auth_mode?: string
  tokens?: {
    id_token?: string
    access_token?: string
    refresh_token?: string
    account_id?: string
  }
}

/** Directory holding the official Codex CLI's auth.json (CODEX_HOME, default ~/.codex). */
export function codexHome(): string {
  const override = process.env['CODEX_HOME']
  if (override && override.trim().length > 0) return override.trim()
  return join(homedir(), '.codex')
}

/** Read the official Codex CLI's `auth.json`, or null if absent/unreadable. */
export function readCodexCliAuth(): CodexAuthDotJson | null {
  const path = join(codexHome(), 'auth.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CodexAuthDotJson
  } catch {
    return null
  }
}

/**
 * Import an existing official `codex login` into our credential store — the
 * analogue of `readClaudeCodeFromKeychain`. Returns the OpenAI API key when the
 * Codex CLI has one cached, else null. Only imports the api key material; we do
 * not copy or refresh Codex's OAuth tokens (Codex owns their rotation).
 */
export function importCodexCliAuth(opts: { persist?: boolean } = {}): string | null {
  const auth = readCodexCliAuth()
  const apiKey = auth?.OPENAI_API_KEY
  if (!apiKey) return null
  if (opts.persist !== false) {
    saveCredential('openai', {
      apiKey,
      accessToken: auth?.tokens?.access_token,
      refreshToken: auth?.tokens?.refresh_token,
      extra: pruneUndefined({ source: 'codex-cli-import', account_id: auth?.tokens?.account_id }),
    })
  }
  return apiKey
}

/**
 * Resolve an OpenAI API key from a Codex login: the stored `openai` credential
 * first, then a read-through import of the official Codex CLI's auth.json.
 * Environment `OPENAI_API_KEY` still takes precedence at the provider layer.
 */
export function resolveOpenAiApiKeyFromCodex(): string | null {
  const stored = getCredential('openai')
  if (stored?.apiKey) return stored.apiKey
  return importCodexCliAuth({ persist: false })
}

export function logoutCodex(): boolean {
  return clearCredential('openai')
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function pruneUndefined(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out
}
