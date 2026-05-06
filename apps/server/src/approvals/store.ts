/**
 * Pending-approval store for Slice 6 — write/destructive ops invoked over
 * the MCP HTTP transport persist a row here when the dispatcher's approval
 * gate cannot resolve synchronously. The web/CLI acks via
 * `POST /api/approvals/:id/ack`, which `awaitApproval` polls until decision
 * or expiry.
 *
 * Persistence is delegated to a swappable `ApprovalStore` so unit tests can
 * use the in-memory implementation in `approvals-memory-store.ts` without
 * touching the database. The default store backs onto the
 * `approval_requests` table via Drizzle.
 *
 * Pattern intentionally mirrors `apps/server/src/github/installations.ts` +
 * `installations-memory-store.ts` (Slice 2) so the codebase has one shape
 * for "swappable persistence with a sane default".
 */

import type { ApprovalActor, OperationTrustClass } from '@orchentra/operations'
import { defaultApprovalStore } from './approvals-store'

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired'

export interface ApprovalRecord {
  id: string
  orgId: string
  operationId: string
  trustClass: OperationTrustClass
  /** Zod-validated input. The writer is responsible for redacting secrets. */
  input: unknown
  requestedBy: ApprovalActor
  requestedAt: Date
  expiresAt: Date
  status: ApprovalStatus
  decidedBy: ApprovalActor | null
  decidedAt: Date | null
  metadata: Record<string, unknown>
}

export interface CreateApprovalInput {
  id?: string
  orgId: string
  operationId: string
  trustClass: OperationTrustClass
  input: unknown
  requestedBy: ApprovalActor
  /** When omitted, the store uses now + DEFAULT_TTL_MS. */
  expiresAt?: Date
  metadata?: Record<string, unknown>
}

export interface RecordDecisionInput {
  id: string
  orgId: string
  decision: 'approved' | 'denied'
  decidedBy: ApprovalActor
}

export interface ApprovalStore {
  create(input: CreateApprovalInput): Promise<ApprovalRecord>
  /** Org-scoped fetch: returns null when the row doesn't exist OR it belongs to a different org. */
  fetch(id: string, orgId: string): Promise<ApprovalRecord | null>
  /** Cross-org fetch (for the gate's poll loop on the local server). */
  fetchInternal(id: string): Promise<ApprovalRecord | null>
  recordDecision(input: RecordDecisionInput): Promise<ApprovalRecord>
  listPending(orgId: string): Promise<ApprovalRecord[]>
  /** Sweep stale rows: anything still 'pending' past expiresAt → 'expired'. */
  expireStale(now: Date): Promise<number>
  clear(): Promise<void>
}

/** 1h default TTL — matches the Slice 6 spec. */
export const DEFAULT_TTL_MS = 60 * 60 * 1000

let activeStore: ApprovalStore = defaultApprovalStore

export function setApprovalStoreForTesting(store: ApprovalStore | null): void {
  activeStore = store ?? defaultApprovalStore
}

export async function createApprovalRequest(input: CreateApprovalInput): Promise<ApprovalRecord> {
  return activeStore.create(input)
}

export async function findApprovalRequest(id: string, orgId: string): Promise<ApprovalRecord | null> {
  return activeStore.fetch(id, orgId)
}

export async function findApprovalRequestInternal(id: string): Promise<ApprovalRecord | null> {
  return activeStore.fetchInternal(id)
}

export async function recordDecision(input: RecordDecisionInput): Promise<ApprovalRecord> {
  return activeStore.recordDecision(input)
}

export async function listPendingApprovals(orgId: string): Promise<ApprovalRecord[]> {
  return activeStore.listPending(orgId)
}

export async function expireStaleApprovals(now: Date = new Date()): Promise<number> {
  return activeStore.expireStale(now)
}

export async function resetApprovalsStoreForTests(): Promise<void> {
  await activeStore.clear()
}
