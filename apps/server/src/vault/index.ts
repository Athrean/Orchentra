/**
 * Per-org credential vault.
 *
 * Public contract (only these three functions cross the module boundary):
 *
 *   storeCredential({ orgId, kind, value, scopes?, metadata?, expiresAt?, actor })
 *   getCredential(orgId, kind, actor)               -> DecryptedCredential | null
 *   rotateCredential({ orgId, kind, value, ...same as store })
 *
 * `value` is the plaintext secret (e.g. a GH App private key PEM, an API
 * token). It is sealed at the boundary; raw bytes never leave the vault
 * module via a return type that escapes here.
 *
 * Every read appends to `audit_log` with redacted metadata — the secret bytes
 * are NOT logged. Operators get `{ orgId, kind, actor, action: 'vault.read'|
 * 'vault.write'|'vault.rotate' }` and a sha-256 prefix of the ciphertext for
 * traceability without exposure.
 *
 * Production target on Supabase Postgres is pgsodium per ORCHENTRA_PLAN.md
 * §3.3.5; the in-tree path (apps/server/src/vault/crypto.ts) wraps Node
 * aes-256-gcm with the same envelope so dev/CI exercise the same module.
 *
 * Persistence is delegated to a `VaultStore` so unit tests can plug in an
 * in-memory store via `setVaultStoreForTesting`. The default store binds to
 * the Drizzle `db` (see `vault/store.ts`).
 */

import { createHash } from 'node:crypto'
import { sealCredential, openCredential } from './crypto'
import { defaultVaultStore } from './store'
import type { VaultActor, VaultStore, VaultStoredRow } from './types'

export type { VaultActor, VaultStore, VaultStoredRow, VaultAuditEntry } from './types'

export interface DecryptedCredential {
  value: string
  scopes: string[]
  metadata: Record<string, unknown>
  expiresAt: Date | null
  rotatedAt: Date
}

export interface StoreCredentialInput {
  orgId: string
  kind: string
  value: string
  scopes?: string[]
  metadata?: Record<string, unknown>
  expiresAt?: Date | null
  actor: VaultActor
}

let activeStore: VaultStore = defaultVaultStore

/** Test seam — swap the persistence boundary. Pass null to reset. */
export function setVaultStoreForTesting(store: VaultStore | null): void {
  activeStore = store ?? defaultVaultStore
}

function fingerprint(envelope: string): string {
  return createHash('sha256').update(envelope).digest('hex').slice(0, 12)
}

export async function storeCredential(input: StoreCredentialInput): Promise<void> {
  const envelope = sealCredential(input.value)
  const row: VaultStoredRow = {
    encryptedValue: envelope,
    scopes: input.scopes ?? [],
    metadata: input.metadata ?? {},
    expiresAt: input.expiresAt ?? null,
    rotatedAt: new Date(),
  }
  await activeStore.upsert(input.orgId, input.kind, row)
  await activeStore.audit({
    orgId: input.orgId,
    actor: input.actor,
    action: 'vault.write',
    resource: { kind: input.kind },
    metadata: { fingerprint: fingerprint(envelope) },
  })
}

export async function getCredential(
  orgId: string,
  kind: string,
  actor: VaultActor,
): Promise<DecryptedCredential | null> {
  const row = await activeStore.fetch(orgId, kind)
  if (!row) return null
  const value = openCredential(row.encryptedValue)
  await activeStore.audit({
    orgId,
    actor,
    action: 'vault.read',
    resource: { kind },
    metadata: { fingerprint: fingerprint(row.encryptedValue) },
  })
  return {
    value,
    scopes: row.scopes,
    metadata: row.metadata,
    expiresAt: row.expiresAt,
    rotatedAt: row.rotatedAt,
  }
}

export async function rotateCredential(input: StoreCredentialInput): Promise<void> {
  const envelope = sealCredential(input.value)
  const row: VaultStoredRow = {
    encryptedValue: envelope,
    scopes: input.scopes ?? [],
    metadata: input.metadata ?? {},
    expiresAt: input.expiresAt ?? null,
    rotatedAt: new Date(),
  }
  await activeStore.update(input.orgId, input.kind, row)
  await activeStore.audit({
    orgId: input.orgId,
    actor: input.actor,
    action: 'vault.rotate',
    resource: { kind: input.kind },
    metadata: { fingerprint: fingerprint(envelope) },
  })
}
