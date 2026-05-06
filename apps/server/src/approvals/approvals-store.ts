/**
 * Default Drizzle-backed implementation of `ApprovalStore`. Lives in its own
 * file so the approval store module can be unit-tested without bringing the
 * drizzle-orm import surface into the test process.
 *
 * Cross-org isolation is enforced at the SQL boundary: org-scoped fetches
 * filter on `org_id` IN-query, so a leaked id alone is not enough to read or
 * mutate another org's row. The route handlers re-check too — defense in
 * depth — but this store is the source of truth.
 */

import type { OperationTrustClass, ApprovalActor } from '@orchentra/operations'
import { and, asc, eq, lte, sql } from 'drizzle-orm'
import { approvalRequests, db } from '../db/client'
import { ApprovalConflictError, ApprovalExpiredError, ApprovalNotFoundError } from './approvals-memory-store'
import type { ApprovalRecord, ApprovalStatus, ApprovalStore, CreateApprovalInput, RecordDecisionInput } from './store'
import { DEFAULT_TTL_MS } from './store'

function rowToRecord(row: typeof approvalRequests.$inferSelect): ApprovalRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    operationId: row.operationId,
    trustClass: row.trustClass as OperationTrustClass,
    input: row.input,
    requestedBy: row.requestedBy as ApprovalActor,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    status: row.status as ApprovalStatus,
    decidedBy: (row.decidedBy as ApprovalActor | null) ?? null,
    decidedAt: row.decidedAt,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  }
}

class DrizzleApprovalStore implements ApprovalStore {
  async create(input: CreateApprovalInput): Promise<ApprovalRecord> {
    const now = new Date()
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + DEFAULT_TTL_MS)
    const [row] = await db
      .insert(approvalRequests)
      .values({
        id: input.id ?? crypto.randomUUID(),
        orgId: input.orgId,
        operationId: input.operationId,
        trustClass: input.trustClass,
        input: input.input as object,
        requestedBy: input.requestedBy,
        requestedAt: now,
        expiresAt,
        status: 'pending',
        metadata: input.metadata ?? {},
      })
      .returning()
    return rowToRecord(row)
  }

  async fetch(id: string, orgId: string): Promise<ApprovalRecord | null> {
    const [row] = await db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.orgId, orgId)))
      .limit(1)
    return row ? rowToRecord(row) : null
  }

  async fetchInternal(id: string): Promise<ApprovalRecord | null> {
    const [row] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).limit(1)
    return row ? rowToRecord(row) : null
  }

  async recordDecision(input: RecordDecisionInput): Promise<ApprovalRecord> {
    const now = new Date()
    // Atomically transition pending → decision; refuse the update if the row
    // is already decided or expired. We re-read after to surface the right
    // error class.
    const [updated] = await db
      .update(approvalRequests)
      .set({ status: input.decision, decidedBy: input.decidedBy, decidedAt: now })
      .where(
        and(
          eq(approvalRequests.id, input.id),
          eq(approvalRequests.orgId, input.orgId),
          eq(approvalRequests.status, 'pending'),
          sql`${approvalRequests.expiresAt} > now()`,
        ),
      )
      .returning()

    if (updated) return rowToRecord(updated)

    const [existing] = await db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, input.id), eq(approvalRequests.orgId, input.orgId)))
      .limit(1)
    if (!existing) throw new ApprovalNotFoundError(`approval ${input.id} not found`)
    const record = rowToRecord(existing)
    if (record.status !== 'pending') throw new ApprovalConflictError(`approval ${input.id} already ${record.status}`)
    if (record.expiresAt.getTime() <= now.getTime()) {
      // Sweep this row to expired; ignore failures (next sweep will catch it).
      await db
        .update(approvalRequests)
        .set({ status: 'expired', decidedAt: now })
        .where(and(eq(approvalRequests.id, input.id), eq(approvalRequests.status, 'pending')))
      throw new ApprovalExpiredError(`approval ${input.id} expired`)
    }
    // Should be unreachable, but keep the explicit conflict path so we don't
    // silently corrupt the row state if the query semantics shift.
    throw new ApprovalConflictError(`approval ${input.id} could not be decided`)
  }

  async listPending(orgId: string): Promise<ApprovalRecord[]> {
    const rows = await db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.orgId, orgId), eq(approvalRequests.status, 'pending')))
      .orderBy(asc(approvalRequests.requestedAt))
    return rows.map(rowToRecord)
  }

  async expireStale(now: Date): Promise<number> {
    const rows = await db
      .update(approvalRequests)
      .set({ status: 'expired', decidedAt: now })
      .where(and(eq(approvalRequests.status, 'pending'), lte(approvalRequests.expiresAt, now)))
      .returning({ id: approvalRequests.id })
    return rows.length
  }

  async clear(): Promise<void> {
    // Production no-op safeguard. Tests should swap the store via
    // setApprovalStoreForTesting() rather than truncating real data.
  }
}

export const defaultApprovalStore: ApprovalStore = new DrizzleApprovalStore()
