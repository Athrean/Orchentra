/**
 * In-memory `ApprovalStore` for unit tests. Mirrors the Drizzle store's
 * behavior without touching the database. Tests should install via
 * `setApprovalStoreForTesting(createMemoryApprovalStore())` in beforeEach.
 *
 * Cross-org isolation is enforced here exactly like in the SQL store: the
 * org-scoped `fetch` returns null when the row exists but lives in a
 * different org. This is the only line of defense the route handlers can
 * rely on, so any change here is mirrored in `approvals-store.ts`.
 */

import type { ApprovalRecord, ApprovalStore, CreateApprovalInput, RecordDecisionInput } from './store'
import { DEFAULT_TTL_MS } from './store'

class ConflictError extends Error {
  readonly code = 'already_decided'
}
class ExpiredError extends Error {
  readonly code = 'expired'
}
class NotFoundError extends Error {
  readonly code = 'not_found'
}

export const ApprovalConflictError = ConflictError
export const ApprovalExpiredError = ExpiredError
export const ApprovalNotFoundError = NotFoundError

export function createMemoryApprovalStore(): ApprovalStore {
  const byId = new Map<string, ApprovalRecord>()

  return {
    async create(input: CreateApprovalInput): Promise<ApprovalRecord> {
      const now = new Date()
      const record: ApprovalRecord = {
        id: input.id ?? crypto.randomUUID(),
        orgId: input.orgId,
        operationId: input.operationId,
        trustClass: input.trustClass,
        input: input.input,
        requestedBy: input.requestedBy,
        requestedAt: now,
        expiresAt: input.expiresAt ?? new Date(now.getTime() + DEFAULT_TTL_MS),
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        metadata: input.metadata ?? {},
      }
      byId.set(record.id, record)
      return clone(record)
    },

    async fetch(id: string, orgId: string): Promise<ApprovalRecord | null> {
      const row = byId.get(id)
      if (!row) return null
      if (row.orgId !== orgId) return null
      return clone(row)
    },

    async fetchInternal(id: string): Promise<ApprovalRecord | null> {
      const row = byId.get(id)
      return row ? clone(row) : null
    },

    async recordDecision(input: RecordDecisionInput): Promise<ApprovalRecord> {
      const row = byId.get(input.id)
      if (!row) throw new NotFoundError(`approval ${input.id} not found`)
      if (row.orgId !== input.orgId) throw new NotFoundError(`approval ${input.id} not found`)
      const now = new Date()
      if (row.status === 'expired' || row.expiresAt.getTime() <= now.getTime()) {
        if (row.status === 'pending') {
          row.status = 'expired'
          row.decidedAt = now
        }
        throw new ExpiredError(`approval ${input.id} expired`)
      }
      if (row.status !== 'pending') {
        throw new ConflictError(`approval ${input.id} already ${row.status}`)
      }
      row.status = input.decision
      row.decidedBy = input.decidedBy
      row.decidedAt = now
      return clone(row)
    },

    async listPending(orgId: string): Promise<ApprovalRecord[]> {
      const out: ApprovalRecord[] = []
      for (const row of byId.values()) {
        if (row.orgId === orgId && row.status === 'pending') out.push(clone(row))
      }
      return out.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
    },

    async expireStale(now: Date): Promise<number> {
      let n = 0
      for (const row of byId.values()) {
        if (row.status === 'pending' && row.expiresAt.getTime() <= now.getTime()) {
          row.status = 'expired'
          row.decidedAt = now
          n += 1
        }
      }
      return n
    },

    async clear(): Promise<void> {
      byId.clear()
    },
  }
}

function clone(r: ApprovalRecord): ApprovalRecord {
  return { ...r, requestedBy: { ...r.requestedBy }, decidedBy: r.decidedBy ? { ...r.decidedBy } : null }
}
