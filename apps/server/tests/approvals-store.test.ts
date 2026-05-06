/**
 * approval_requests CRUD tests against the in-memory store.
 *
 * Same in-memory-store pattern as installations.test.ts and vault.test.ts —
 * no global drizzle-orm mock so unrelated server tests stay green.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  createApprovalRequest,
  expireStaleApprovals,
  findApprovalRequest,
  findApprovalRequestInternal,
  listPendingApprovals,
  recordDecision,
  setApprovalStoreForTesting,
} from '../src/approvals/store'
import {
  ApprovalConflictError,
  ApprovalExpiredError,
  ApprovalNotFoundError,
  createMemoryApprovalStore,
} from '../src/approvals/approvals-memory-store'

afterAll(() => {
  setApprovalStoreForTesting(null)
})

beforeEach(() => {
  setApprovalStoreForTesting(createMemoryApprovalStore())
})

afterEach(() => {
  setApprovalStoreForTesting(createMemoryApprovalStore())
})

describe('createApprovalRequest', () => {
  test('persists a pending row with default 1h expiry', async () => {
    const before = Date.now()
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: { owner: 'a', repo: 'b', prNumber: 1, body: 'hi', kind: 'note' },
      requestedBy: { id: 'agent_42', type: 'agent' },
    })
    expect(row.id).toMatch(/[0-9a-f-]{36}/)
    expect(row.status).toBe('pending')
    const ttl = row.expiresAt.getTime() - row.requestedAt.getTime()
    expect(ttl).toBeGreaterThanOrEqual(60 * 60 * 1000 - 5)
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000 + 5)
    expect(row.requestedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  test('honors caller-supplied expiresAt', async () => {
    const expiresAt = new Date('2030-01-01T00:00:00Z')
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
      expiresAt,
    })
    expect(row.expiresAt.toISOString()).toBe(expiresAt.toISOString())
  })
})

describe('findApprovalRequest cross-org isolation', () => {
  test('returns null when fetching another orgs row', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
    })
    expect(await findApprovalRequest(row.id, 'org-2')).toBeNull()
    expect(await findApprovalRequest(row.id, 'org-1')).not.toBeNull()
  })

  test('fetchInternal ignores org for the gate poll loop', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
    })
    expect(await findApprovalRequestInternal(row.id)).not.toBeNull()
  })
})

describe('recordDecision', () => {
  test('flips pending → approved and stamps decidedBy/decidedAt', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_42' },
    })
    const decided = await recordDecision({
      id: row.id,
      orgId: 'org-1',
      decision: 'approved',
      decidedBy: { id: 'human_alice' },
    })
    expect(decided.status).toBe('approved')
    expect(decided.decidedBy?.id).toBe('human_alice')
    expect(decided.decidedAt).not.toBeNull()
  })

  test('rejects ack from a different org as not_found', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
    })
    let raised: unknown
    try {
      await recordDecision({ id: row.id, orgId: 'org-2', decision: 'approved', decidedBy: { id: 'b' } })
    } catch (err) {
      raised = err
    }
    expect(raised).toBeInstanceOf(ApprovalNotFoundError)
  })

  test('rejects double-ack with conflict error', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
    })
    await recordDecision({ id: row.id, orgId: 'org-1', decision: 'approved', decidedBy: { id: 'b' } })
    let raised: unknown
    try {
      await recordDecision({ id: row.id, orgId: 'org-1', decision: 'denied', decidedBy: { id: 'c' } })
    } catch (err) {
      raised = err
    }
    expect(raised).toBeInstanceOf(ApprovalConflictError)
  })

  test('rejects decision on expired row', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
      expiresAt: new Date(Date.now() - 1000),
    })
    let raised: unknown
    try {
      await recordDecision({ id: row.id, orgId: 'org-1', decision: 'approved', decidedBy: { id: 'b' } })
    } catch (err) {
      raised = err
    }
    expect(raised).toBeInstanceOf(ApprovalExpiredError)
  })
})

describe('listPendingApprovals + expireStale', () => {
  test('lists only pending rows for the requesting org', async () => {
    const a = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'op_a',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
    })
    await createApprovalRequest({
      orgId: 'org-2',
      operationId: 'op_b',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'b' },
    })
    const decided = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'op_c',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'c' },
    })
    await recordDecision({ id: decided.id, orgId: 'org-1', decision: 'denied', decidedBy: { id: 'human' } })

    const pending = await listPendingApprovals('org-1')
    expect(pending.map((r) => r.id)).toEqual([a.id])
  })

  test('expireStale flips overdue pending rows to expired and reports the count', async () => {
    await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'op_a',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
      expiresAt: new Date(Date.now() - 1000),
    })
    await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'op_b',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'b' },
      expiresAt: new Date(Date.now() + 60_000),
    })
    const swept = await expireStaleApprovals(new Date())
    expect(swept).toBe(1)
    expect(await listPendingApprovals('org-1')).toHaveLength(1)
  })
})
