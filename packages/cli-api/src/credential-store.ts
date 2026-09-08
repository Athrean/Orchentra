import { userPaths } from '@orchentra/cli-core'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'

export type ProviderKey =
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'xai'
  | 'dashscope'
  | 'gemini'
  // Google Antigravity — the subscription successor to Google's retired free
  // coding tier. Kept separate from `gemini` because the two use different
  // OAuth clients and different Code Assist hosts.
  | 'antigravity'
  // opencode Zen / opencode Go — one API key fronting many model families.
  | 'zen'
  | 'github'
  | 'aws'
  | 'gcp'
  | 'azure'

export interface StoredCredential {
  readonly apiKey?: string
  readonly accessToken?: string
  readonly refreshToken?: string
  readonly expiresAt?: number
  readonly scopes?: readonly string[]
  readonly accountEmail?: string
  readonly extra?: Record<string, string>
}

interface CredentialsFile {
  version: 1
  providers: Partial<Record<ProviderKey, StoredCredential>>
}

const FILE_MODE = 0o600
const DIR_MODE = 0o700

export function credentialsPath(home: string = homedir()): string {
  return join(userPaths({ home }).config, 'credentials.json')
}

export function loadCredentials(home: string = homedir()): CredentialsFile {
  const path = credentialsPath(home)
  if (!existsSync(path)) return { version: 1, providers: {} }
  try {
    const text = readFileSync(path, 'utf8')
    if (!text.trim()) return { version: 1, providers: {} }
    const parsed = JSON.parse(text) as Partial<CredentialsFile>
    return { version: 1, providers: parsed.providers ?? {} }
  } catch {
    return { version: 1, providers: {} }
  }
}

/**
 * Keychain service name shared by the sync reader below and the async
 * keytar-backed store in `keychain-store.ts`. It lives here because the read
 * path must not import that module: `/login` writes through keytar, every
 * provider constructor reads through {@link getCredential}, and when those two
 * disagreed a saved key was written to the Keychain and then never found
 * again (a pasted opencode Zen key reported "saved" and left the provider
 * unauthenticated).
 */
export const KEYCHAIN_SERVICE = 'Orchentra-credentials'

export function getCredential(provider: ProviderKey, home: string = homedir()): StoredCredential | null {
  const file = loadCredentials(home)
  const fromFile = file.providers[provider]
  if (fromFile) return fromFile
  return readKeychainSync(provider, home)
}

/**
 * One `security` subprocess per provider per process — misses cached as null.
 * Provider construction, preflight, and the doctor check all call
 * {@link getCredential} for the same keys, and an uncached miss costs a process
 * spawn each time.
 */
const KEYCHAIN_READ_TIMEOUT_MS = 2_000

const keychainCache = new Map<ProviderKey, StoredCredential | null>()
/**
 * Set once a read is killed or errors. A locked or unapproved Keychain
 * refuses every provider identically, and `whoami` asks about eight of them.
 */
let keychainUnavailable = false

/** Drop the cached Keychain read for one provider after a write through keytar. */
export function invalidateKeychainCache(provider: ProviderKey): void {
  keychainCache.delete(provider)
}

/**
 * Read one credential out of the login Keychain synchronously, so the sync
 * provider constructors can see what the async `/login` writer stored. Skipped
 * off darwin and whenever the caller redirected the credential root, which is
 * how tests stay off the developer's real Keychain.
 */
function readKeychainSync(provider: ProviderKey, home: string): StoredCredential | null {
  if (process.platform !== 'darwin') return null
  if (process.env['XDG_CONFIG_HOME']) return null
  if (home !== homedir()) return null
  if (keychainUnavailable) return null
  const cached = keychainCache.get(provider)
  if (cached !== undefined) return cached
  let parsed: StoredCredential | null = null
  try {
    const res = spawnSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', provider, '-w'], {
      encoding: 'utf8',
      // An authorized read returns in milliseconds. An unauthorized one puts a
      // modal Keychain prompt on screen and blocks until somebody answers it —
      // which, from a non-interactive process, is forever. Bound the wait and
      // treat a timeout as "no credential" so a locked or unapproved Keychain
      // degrades to the env/file path instead of hanging the CLI.
      timeout: KEYCHAIN_READ_TIMEOUT_MS,
    })
    // A timeout kills the child with SIGTERM. The Keychain refuses every
    // provider the same way, so stop asking rather than paying the timeout
    // once per provider — `whoami` alone asks about eight.
    if (res.error !== undefined || typeof res.signal === 'string') keychainUnavailable = true
    if (res.status === 0 && res.stdout) parsed = JSON.parse(res.stdout.trim()) as StoredCredential
  } catch {
    parsed = null
  }
  // Cached either way: a miss and a refusal are both answers, and re-asking
  // once per provider construction would re-open the same dialog.
  keychainCache.set(provider, parsed)
  return parsed
}

export function saveCredential(provider: ProviderKey, credential: StoredCredential, home: string = homedir()): string {
  keychainCache.delete(provider)
  const path = credentialsPath(home)
  const file = loadCredentials(home)
  file.providers[provider] = credential
  writeCredentialsAtomic(path, file)
  return path
}

export function clearCredential(provider: ProviderKey, home: string = homedir()): boolean {
  keychainCache.delete(provider)
  const path = credentialsPath(home)
  const file = loadCredentials(home)
  if (!file.providers[provider]) return false
  delete file.providers[provider]
  writeCredentialsAtomic(path, file)
  return true
}

export function listCredentialProviders(home: string = homedir()): ProviderKey[] {
  const file = loadCredentials(home)
  return Object.keys(file.providers) as ProviderKey[]
}

function writeCredentialsAtomic(path: string, file: CredentialsFile): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: DIR_MODE })
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n', { mode: FILE_MODE })
  try {
    renameSync(tmp, path)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    throw err
  }
  try {
    chmodSync(path, FILE_MODE)
  } catch {
    /* ignore — permissions best-effort on non-POSIX */
  }
}

export interface ResolvedApiKey {
  readonly apiKey: string
  readonly source: 'env' | 'file'
  readonly envVar?: string
}

export function resolveApiKey(
  provider: ProviderKey,
  envVars: readonly string[],
  home: string = homedir(),
): ResolvedApiKey | null {
  for (const name of envVars) {
    const v = process.env[name]
    if (v && v.trim().length > 0) {
      return { apiKey: v.trim(), source: 'env', envVar: name }
    }
  }
  const stored = getCredential(provider, home)
  if (stored?.apiKey) {
    return { apiKey: stored.apiKey, source: 'file' }
  }
  return null
}
