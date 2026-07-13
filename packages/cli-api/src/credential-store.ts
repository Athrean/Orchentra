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
  // ORCHENTRA_CONFIG_HOME overrides the default $HOME/.config root —
  // matches the convention used elsewhere (cli-core runtime config) and
  // gives tests an isolated path so they don't read or mutate a
  // developer's real OAuth bundle.
  const override = process.env['ORCHENTRA_CONFIG_HOME']
  if (override && override.length > 0) {
    return join(override, 'credentials.json')
  }
  return join(home, '.config', 'orchentra', 'credentials.json')
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

export function getCredential(provider: ProviderKey, home: string = homedir()): StoredCredential | null {
  const file = loadCredentials(home)
  return file.providers[provider] ?? null
}

export function saveCredential(provider: ProviderKey, credential: StoredCredential, home: string = homedir()): string {
  const path = credentialsPath(home)
  const file = loadCredentials(home)
  file.providers[provider] = credential
  writeCredentialsAtomic(path, file)
  return path
}

export function clearCredential(provider: ProviderKey, home: string = homedir()): boolean {
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
