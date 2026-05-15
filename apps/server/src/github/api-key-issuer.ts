import { createHash, randomBytes } from 'node:crypto'

/**
 * Mints an Orchentra apiKey scoped to a single GitHub App installation. The
 * plaintext is 32 bytes of CSPRNG output, base64url-encoded for transport
 * (no padding to keep query-string handling simple). The SHA-256 hash is
 * what we persist on the installations row — the plaintext is returned
 * exactly once via the loopback redirect and never logged.
 */
export interface MintedApiKey {
  readonly plaintext: string
  readonly hash: string
}

export function mintApiKey(): MintedApiKey {
  const plaintext = randomBytes(32).toString('base64url')
  return { plaintext, hash: hashApiKey(plaintext) }
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}
