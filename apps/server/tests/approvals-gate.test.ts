/**
 * Suspendable approval gate tests. Uses the in-memory store + a manual
 * sleep/now seam so the loop runs synchronously.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  createApprovalRequest,
  recordDecision,
  setApprovalStoreForTesting,
} from '../src/approvals/store'
import { createMemoryApprovalStore } from '../src/approvals/approvals-memory-store'
import { awaitApproval } from '../src/approvals/gate'

afterAll(() => {
  setApprovalStoreForTesting(null)
})

beforeEach(() => {
  setApprovalStoreForTesting(createMemoryApprovalStore())
})

async function nextTick(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

function controllableSleep(getNow: () => number): {
  sleep: (ms: number) => Promise<void>
  flushAll: () => void
} {
  const pending: Array<{ resolve: () => void; deadline: number }> = []
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      pending.push({ resolve, deadline: getNow() + ms })
    })
  const flushAll = (): void => {
    const now = getNow()
    const due = pending.filter((p) => p.deadline <= now)
    for (const p of due) {
      pending.splice(pending.indexOf(p), 1)
      p.resolve()
    }
  }
  return { sleep, flushAll }
}

describe('awaitApproval', () => {
  test('resolves with approved when the row flips to approved', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_42' },
    })
    let virtualNow = 0
    const { sleep, flushAll } = controllableSleep(() => virtualNow)
    const promise = awaitApproval(row.id, {
      sleep,
      now: () => virtualNow,
      initialIntervalMs: 50,
    })
    // First poll sees pending. Yield so the gate registers its first sleep,
    // then decide and advance virtual time past the sleep deadline.
    await nextTick()
    await recordDecision({ id: row.id, orgId: 'org-1', decision: 'approved', decidedBy: { id: 'human_alice' } })
    virtualNow = 50
    flushAll()
    const result = await promise
    expect(result.status).toBe('approved')
    if (result.status === 'approved') expect(result.decidedBy.id).toBe('human_alice')
  })

  test('resolves with denied when the row flips to denied', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
    })
    let virtualNow = 0
    const { sleep, flushAll } = controllableSleep(() => virtualNow)
    const promise = awaitApproval(row.id, { sleep, now: () => virtualNow, initialIntervalMs: 50 })
    await nextTick()
    await recordDecision({ id: row.id, orgId: 'org-1', decision: 'denied', decidedBy: { id: 'human' } })
    virtualNow = 50
    flushAll()
    const result = await promise
    expect(result.status).toBe('denied')
  })

  test('resolves with expired when the row passes its expiresAt without a decision', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
      expiresAt: new Date(100),
    })
    let virtualNow = 0
    const { sleep, flushAll } = controllableSleep(() => virtualNow)
    const promise = awaitApproval(row.id, { sleep, now: () => virtualNow, initialIntervalMs: 50 })
    // First poll: pending, expiresAt = 100, virtualNow = 0 → not expired yet → sleeps.
    await nextTick()
    virtualNow = 200
    flushAll()
    const result = await promise
    expect(result.status).toBe('expired')
  })

  test('resolves with cancelled when the AbortSignal fires', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
    })
    const ac = new AbortController()
    let virtualNow = 0
    const { sleep, flushAll } = controllableSleep(() => virtualNow)
    const promise = awaitApproval(row.id, {
      sleep,
      now: () => virtualNow,
      initialIntervalMs: 50,
      signal: ac.signal,
    })
    await nextTick()
    ac.abort()
    virtualNow = 50
    flushAll()
    const result = await promise
    expect(result.status).toBe('cancelled')
  })

  test('resolves with timeout when budget is exhausted', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'a' },
      // Far-future expiry, so the timeout path triggers before expiry.
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    })
    let virtualNow = 0
    const { sleep, flushAll } = controllableSleep(() => virtualNow)
    const promise = awaitApproval(row.id, {
      sleep,
      now: () => virtualNow,
      initialIntervalMs: 50,
      timeoutMs: 100,
    })
    await nextTick()
    virtualNow = 200
    flushAll()
    const result = await promise
    expect(result.status).toBe('timeout')
  })

  test('resolves with not_found when the row does not exist', async () => {
    const result = await awaitApproval('nonexistent-id', { initialIntervalMs: 1, timeoutMs: 50 })
    expect(result.status).toBe('not_found')
  })
})
