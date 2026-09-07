import type { MacKeychain } from '../keychain'
import type { StoredCredential } from '../credential-store'

// Claude Code stores its OAuth bundle on macOS as a generic-password keychain
// item with this service name. Multi-account installs use suffixed variants
// (e.g. `Claude Code-credentials-work`); we treat the canonical name as the
// preferred entry and fall back to the first matching variant.
export const CLAUDE_CODE_KEYCHAIN_SERVICE = 'Claude Code-credentials'

// The default scope set Claude Code requests at /login. Imported credentials
// don't expose the original scope claim; we tag with this so consumers see
// the same shape they'd get from a fresh OAuth flow.
const CLAUDE_CODE_DEFAULT_SCOPES: readonly string[] = ['user:inference', 'user:profile']

export interface NamedClaudeCodeCredential {
  readonly service: string
  readonly credential: StoredCredential
}

interface ClaudeAiOauthPayload {
  claudeAiOauth?: {
    accessToken?: unknown
    refreshToken?: unknown
    expiresAt?: unknown
    scopes?: unknown
  }
}

// Read a parsed Claude Code OAuth credential from the macOS Keychain.
// Tries the canonical service name first, then any prefix variants.
// Returns null if none are found or all parse failures.
export async function loadClaudeCodeOauth(keychain: MacKeychain): Promise<StoredCredential | null> {
  const canonical = await readEntry(keychain, CLAUDE_CODE_KEYCHAIN_SERVICE)
  if (canonical) return canonical

  const services = await keychain.listGenericPasswordServices(CLAUDE_CODE_KEYCHAIN_SERVICE)
  for (const service of services) {
    if (service === CLAUDE_CODE_KEYCHAIN_SERVICE) continue
    const cred = await readEntry(keychain, service)
    if (cred) return cred
  }
  return null
}

// Enumerate every Claude Code OAuth credential present on the keychain.
// Useful when offering an account picker; resolver code typically only
// needs loadClaudeCodeOauth.
export async function loadAllClaudeCodeOauth(keychain: MacKeychain): Promise<readonly NamedClaudeCodeCredential[]> {
  const services = await keychain.listGenericPasswordServices(CLAUDE_CODE_KEYCHAIN_SERVICE)
  const out: NamedClaudeCodeCredential[] = []
  for (const service of services) {
    const credential = await readEntry(keychain, service)
    if (credential) out.push({ service, credential })
  }
  return out
}

async function readEntry(keychain: MacKeychain, service: string): Promise<StoredCredential | null> {
  const entry = await keychain.findGenericPassword(service)
  if (!entry) return null
  const cred = parsePayload(entry.password)
  if (!cred) return null
  return {
    ...cred,
    extra: { source: 'claude-code-keychain', service },
  }
}

function parsePayload(raw: string): StoredCredential | null {
  let parsed: ClaudeAiOauthPayload
  try {
    parsed = JSON.parse(raw) as ClaudeAiOauthPayload
  } catch {
    return null
  }
  const oauth = parsed.claudeAiOauth
  if (!oauth || typeof oauth.accessToken !== 'string' || oauth.accessToken.length === 0) return null
  return {
    accessToken: oauth.accessToken,
    refreshToken: typeof oauth.refreshToken === 'string' ? oauth.refreshToken : undefined,
    expiresAt: typeof oauth.expiresAt === 'number' ? oauth.expiresAt : undefined,
    scopes: Array.isArray(oauth.scopes)
      ? (oauth.scopes.filter((s): s is string => typeof s === 'string') as readonly string[])
      : CLAUDE_CODE_DEFAULT_SCOPES,
  }
}
