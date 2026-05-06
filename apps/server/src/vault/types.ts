/** Shared types between the vault entry point and its persistence backends. */

export interface VaultActor {
  type: 'user' | 'agent' | 'system'
  id: string
}

export interface VaultStoredRow {
  encryptedValue: string
  scopes: string[]
  metadata: Record<string, unknown>
  expiresAt: Date | null
  rotatedAt: Date
}

export interface VaultAuditEntry {
  orgId: string
  actor: VaultActor
  action: 'vault.read' | 'vault.write' | 'vault.rotate'
  resource: { kind: string }
  metadata: Record<string, unknown>
}

export interface VaultStore {
  upsert(orgId: string, kind: string, row: VaultStoredRow): Promise<void>
  fetch(orgId: string, kind: string): Promise<VaultStoredRow | null>
  update(orgId: string, kind: string, row: VaultStoredRow): Promise<void>
  audit(entry: VaultAuditEntry): Promise<void>
}
