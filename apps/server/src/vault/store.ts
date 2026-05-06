/**
 * Persistence boundary for the credential vault.
 *
 * Lives separately from `index.ts` so unit tests can plug in an in-memory
 * implementation without globally mocking `drizzle-orm` (which leaks across
 * the bun:test process and breaks unrelated tests).
 *
 * The default implementation binds to the shared Drizzle `db` against the
 * `credentials` and `audit_log` tables.
 */

import { and, eq } from 'drizzle-orm'
import { db, credentials, auditLog } from '../db/client'
import type { VaultStore, VaultStoredRow, VaultAuditEntry } from './types'

class DrizzleVaultStore implements VaultStore {
  async upsert(orgId: string, kind: string, row: VaultStoredRow): Promise<void> {
    await db
      .insert(credentials)
      .values({
        id: crypto.randomUUID(),
        orgId,
        kind,
        encryptedValue: row.encryptedValue,
        scopes: row.scopes,
        metadata: row.metadata,
        expiresAt: row.expiresAt,
        rotatedAt: row.rotatedAt,
      })
      .onConflictDoUpdate({
        target: [credentials.orgId, credentials.kind],
        set: {
          encryptedValue: row.encryptedValue,
          scopes: row.scopes,
          metadata: row.metadata,
          expiresAt: row.expiresAt,
          rotatedAt: row.rotatedAt,
        },
      })
  }

  async fetch(orgId: string, kind: string): Promise<VaultStoredRow | null> {
    const [r] = await db
      .select()
      .from(credentials)
      .where(and(eq(credentials.orgId, orgId), eq(credentials.kind, kind)))
      .limit(1)
    if (!r) return null
    return {
      encryptedValue: r.encryptedValue,
      scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      expiresAt: r.expiresAt,
      rotatedAt: r.rotatedAt,
    }
  }

  async update(orgId: string, kind: string, row: VaultStoredRow): Promise<void> {
    await db
      .update(credentials)
      .set({
        encryptedValue: row.encryptedValue,
        scopes: row.scopes,
        metadata: row.metadata,
        expiresAt: row.expiresAt,
        rotatedAt: row.rotatedAt,
      })
      .where(and(eq(credentials.orgId, orgId), eq(credentials.kind, kind)))
  }

  async audit(entry: VaultAuditEntry): Promise<void> {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      orgId: entry.orgId,
      actor: entry.actor,
      action: entry.action,
      resource: entry.resource,
      metadata: entry.metadata,
    })
  }
}

export const defaultVaultStore: VaultStore = new DrizzleVaultStore()
