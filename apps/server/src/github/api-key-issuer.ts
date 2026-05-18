import { generateApiKey, hashApiKey as hashApiKeyShared } from '../auth/session'

/**
 * Mints an Orchentra apiKey scoped to a single GitHub App installation.
 *
 * The plaintext shares the `orch_<hex>` format used by user-issued keys
 * (see `auth/session.generateApiKey`) so `requireAuth` can recognize and
 * validate both kinds through the same `Bearer orch_*` precondition. The
 * SHA-256 hash is what we persist on the installations row — the plaintext
 * is returned exactly once via the loopback redirect and never logged.
 */
export interface MintedApiKey {
  readonly plaintext: string
  readonly hash: string
}

export function mintApiKey(): MintedApiKey {
  const plaintext = generateApiKey()
  return { plaintext, hash: hashApiKeyShared(plaintext) }
}

export const hashApiKey = hashApiKeyShared
