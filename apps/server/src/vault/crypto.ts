/**
 * In-tree encryption envelope for the credential vault.
 *
 * Production target on Supabase Postgres is `pgsodium.crypto_aead_det_encrypt`
 * (see ORCHENTRA_PLAN.md §3.3.5). The in-tree path used by dev/CI wraps
 * Node `aes-256-gcm` so callers don't need a Supabase dependency just to
 * exercise the vault module. The on-disk envelope is the same shape in both
 * cases — a single `:`-joined `<ciphertext>:<iv>:<tag>` string stored in
 * the `credentials.encrypted_value` text column.
 *
 * The key is derived from `VAULT_SECRET` (preferred) or `LLM_CONFIG_SECRET`
 * (already in turbo.json globalEnv, used by the existing per-org LLM-config
 * crypto module — keeping the same env var avoids forcing a second secret
 * rotation on operators).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

function getKey(): Buffer {
  const secret = process.env.VAULT_SECRET ?? process.env.LLM_CONFIG_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'VAULT_SECRET (or LLM_CONFIG_SECRET) env var must be set to a string of at least 16 characters before vault credentials can be encrypted/decrypted',
    )
  }
  return createHash('sha256').update(secret).digest()
}

/** Encrypt plaintext into the on-disk envelope string. */
export function sealCredential(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [ct.toString('base64'), iv.toString('base64'), tag.toString('base64')].join(':')
}

/** Decrypt an on-disk envelope back to plaintext. Throws on tampered input. */
export function openCredential(envelope: string): string {
  const key = getKey()
  const parts = envelope.split(':')
  if (parts.length !== 3) {
    throw new Error('vault envelope malformed: expected <ciphertext>:<iv>:<tag>')
  }
  const [ctB64, ivB64, tagB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ct = Buffer.from(ctB64, 'base64')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}
