import { homedir } from 'node:os'
import {
  clearCredential,
  getCredential,
  listCredentialProviders,
  type ProviderKey,
  saveCredential,
  type StoredCredential,
} from './credential-store'

/**
 * Minimal subset of keytar's API surface that we depend on. Modelled after
 * keytar so the real module drops in as a {@link KeychainShim}. Kept narrow
 * on purpose: anything else would couple the credential store to keytar's
 * full surface and make non-darwin fallback harder.
 */
export interface KeychainShim {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>
}

export const KEYCHAIN_SERVICE = 'Orchentra-credentials'

/**
 * Try to lazy-load keytar. Returns null if the native module is missing or
 * fails to load — callers fall back to the plaintext file store. The dynamic
 * import means CI environments without a keytar build do not crash at module
 * load time.
 */
export async function tryLoadKeytar(): Promise<KeychainShim | null> {
  try {
    const mod = (await import('keytar')) as unknown as { default?: KeychainShim } & KeychainShim
    if (typeof mod.getPassword === 'function') return mod
    if (mod.default && typeof mod.default.getPassword === 'function') return mod.default
    return null
  } catch {
    return null
  }
}

export async function saveCredentialAsync(
  provider: ProviderKey,
  credential: StoredCredential,
  home: string = homedir(),
  shim: KeychainShim | null,
): Promise<void> {
  if (shim) {
    try {
      await shim.setPassword(KEYCHAIN_SERVICE, provider, JSON.stringify(credential))
      return
    } catch {
      // fall through to file
    }
  }
  saveCredential(provider, credential, home)
}

export async function getCredentialAsync(
  provider: ProviderKey,
  home: string = homedir(),
  shim: KeychainShim | null,
): Promise<StoredCredential | null> {
  if (shim) {
    try {
      const raw = await shim.getPassword(KEYCHAIN_SERVICE, provider)
      if (raw) return parseCredential(raw)
    } catch {
      // fall through to file
    }
  }
  const fromFile = getCredential(provider, home)
  if (fromFile && shim) {
    try {
      await shim.setPassword(KEYCHAIN_SERVICE, provider, JSON.stringify(fromFile))
      clearCredential(provider, home)
    } catch {
      // migration is best-effort
    }
  }
  return fromFile
}

export async function clearCredentialAsync(
  provider: ProviderKey,
  home: string = homedir(),
  shim: KeychainShim | null,
): Promise<boolean> {
  let removed = false
  if (shim) {
    try {
      if (await shim.deletePassword(KEYCHAIN_SERVICE, provider)) removed = true
    } catch {
      // ignore
    }
  }
  if (clearCredential(provider, home)) removed = true
  return removed
}

export async function listCredentialProvidersAsync(
  home: string = homedir(),
  shim: KeychainShim | null,
): Promise<ProviderKey[]> {
  const merged = new Set<ProviderKey>(listCredentialProviders(home))
  if (shim) {
    try {
      const entries = await shim.findCredentials(KEYCHAIN_SERVICE)
      for (const entry of entries) merged.add(entry.account as ProviderKey)
    } catch {
      // ignore
    }
  }
  return Array.from(merged)
}

export interface ResolvedApiKeyAsync {
  readonly apiKey: string
  readonly source: 'env' | 'keychain' | 'file'
  readonly envVar?: string
}

export async function resolveApiKeyAsync(
  provider: ProviderKey,
  envVars: readonly string[],
  home: string = homedir(),
  shim: KeychainShim | null,
): Promise<ResolvedApiKeyAsync | null> {
  for (const name of envVars) {
    const v = process.env[name]
    if (v && v.trim().length > 0) {
      return { apiKey: v.trim(), source: 'env', envVar: name }
    }
  }
  if (shim) {
    try {
      const raw = await shim.getPassword(KEYCHAIN_SERVICE, provider)
      if (raw) {
        const parsed = parseCredential(raw)
        if (parsed?.apiKey) return { apiKey: parsed.apiKey, source: 'keychain' }
      }
    } catch {
      // fall through
    }
  }
  const fromFile = getCredential(provider, home)
  if (fromFile?.apiKey) return { apiKey: fromFile.apiKey, source: 'file' }
  return null
}

function parseCredential(raw: string): StoredCredential | null {
  try {
    return JSON.parse(raw) as StoredCredential
  } catch {
    return null
  }
}
