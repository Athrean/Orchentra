/**
 * End-to-end approval flow:
 *   1. MCP HTTP transport dispatches a write op via handleHttpRpc.
 *   2. The configured ApprovalPort persists a pending row in the store.
 *   3. The dispatcher returns awaiting_approval to the MCP caller.
 *   4. POST /api/approvals/:id/ack flips the row to approved.
 *   5. awaitApproval (the gate's poll loop) resolves with the decision.
 *
 * Stays in the in-memory store the whole way — no real DB. Confirms the
 * cross-boundary contract (mcp-server <-> apps/server) without coupling
 * the packages' import graphs.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Operation } from '@orchentra/operations'
import { handleHttpRpc } from '@orchentra/mcp-server'
import { setApprovalStoreForTesting } from '../src/approvals/store'
import { createMemoryApprovalStore } from '../src/approvals/approvals-memory-store'
import { serverApprovalPort } from '../src/approvals/mcp-port'
import { awaitApproval } from '../src/approvals/gate'
import { approvalsRouter } from '../src/routes/approvals'
import type { AppVariables, UserRow } from '../src/types'

afterAll(() => {
  setApprovalStoreForTesting(null)
})

beforeEach(() => {
  setApprovalStoreForTesting(createMemoryApprovalStore())
})

function writeOp(): Operation<{ body: string }, { posted: boolean }> {
  return {
    id: 'post_thing',
    description: '',
    scope: 'write',
    localOnly: false,
    mutating: true,
    parameters: z.object({ body: z.string() }),
    handler: async () => ({ posted: true }),
  }
}

function mountAckApp(orgId: string, userId: string): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('*', async (c, next) => {
    c.set('orgId', orgId)
    c.set('user', { id: userId } as unknown as UserRow)
    await next()
  })
  app.route('/api/orgs/:orgId', approvalsRouter)
  return app
}

function authedMcpRequest(body: unknown, orgId = 'org-1', token = 'agent_42'): Request {
  return new Request('https://mcp.example.com/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-orchentra-org': orgId,
    },
    body: JSON.stringify(body),
  })
}

async function nextTick(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('end-to-end approval flow', () => {
  test('MCP write call → awaiting_approval → ack via REST → gate resolves approved', async () => {
    const deps = {
      operations: [writeOp() as Operation],
      serverInfo: { name: 'orchentra-mcp', version: '0.1.0' },
      approvalPort: serverApprovalPort,
    }

    // Step 1: agent calls the write op over MCP HTTP. Expect awaiting_approval.
    const mcpRes = await handleHttpRpc(
      authedMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'post_thing', arguments: { body: 'audit me' } },
      }),
      deps,
    )
    expect(mcpRes.status).toBe(200)
    const mcpBody = (await mcpRes.json()) as {
      result: { content: Array<{ text: string }>; isError: boolean }
    }
    expect(mcpBody.result.isError).toBe(true)
    const errPayload = JSON.parse(mcpBody.result.content[0].text) as { code: string; docs: string }
    expect(errPayload.code).toBe('awaiting_approval')
    const docs = JSON.parse(errPayload.docs) as { approvalId: string; expiresAt: string }
    const approvalId = docs.approvalId

    // Step 2: kick off the gate's poll loop. It would block forever in real
    // life, but we feed a short timeout so the test fails fast on a bug.
    const gatePromise = awaitApproval(approvalId, { initialIntervalMs: 5, timeoutMs: 5000 })

    // Step 3: human acks via the REST route.
    await nextTick()
    const ackApp = mountAckApp('org-1', 'human_alice')
    const ackRes = await ackApp.request(`/api/orgs/org-1/approvals/${approvalId}/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    })
    expect(ackRes.status).toBe(200)

    // Step 4: gate resolves with approved + decidedBy.
    const decision = await gatePromise
    expect(decision.status).toBe('approved')
    if (decision.status === 'approved') expect(decision.decidedBy.id).toBe('human_alice')
  })

  test('expired approval surfaces as expired in awaitApproval and 410 on ack', async () => {
    const deps = {
      operations: [writeOp() as Operation],
      serverInfo: { name: 'orchentra-mcp', version: '0.1.0' },
      approvalPort: serverApprovalPort,
    }
    // Persist an approval, then time-travel its expiry into the past via a
    // second write through the in-memory store. (Easier than monkey-patching
    // the port's TTL.)
    const mcpRes = await handleHttpRpc(
      authedMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'post_thing', arguments: { body: 'expire me' } },
      }),
      deps,
    )
    const errPayload = JSON.parse(
      ((await mcpRes.json()) as { result: { content: Array<{ text: string }> } }).result.content[0].text,
    ) as {
      docs: string
    }
    const approvalId = (JSON.parse(errPayload.docs) as { approvalId: string }).approvalId

    // Force-expire by re-creating with the same id — easiest path with the
    // memory store. The Drizzle store would expose an expireById helper for
    // production cron sweeps; for the test we just sweep with a future now.
    const { expireStaleApprovals } = await import('../src/approvals/store')
    // First, manually advance the row's expiresAt by re-inserting via the
    // store API. The memory store doesn't expose mutation, so instead we
    // sweep using a far-future "now" — every pending row past its expiresAt
    // (even if expiresAt is 5min from now) flips to expired when we sweep
    // with now = expiresAt + 1s.
    const swept = await expireStaleApprovals(new Date(Date.now() + 24 * 60 * 60 * 1000))
    expect(swept).toBe(1)

    // awaitApproval sees the row as expired without needing to poll the
    // gate's expiresAt-clock check.
    const decision = await awaitApproval(approvalId, { initialIntervalMs: 1, timeoutMs: 100 })
    expect(decision.status).toBe('expired')

    // Acking an expired row → 410.
    const ackApp = mountAckApp('org-1', 'human_alice')
    const ackRes = await ackApp.request(`/api/orgs/org-1/approvals/${approvalId}/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    })
    expect(ackRes.status).toBe(410)
  })

  test('cross-org leak: org-2 cannot ack org-1 MCP-created approval', async () => {
    const deps = {
      operations: [writeOp() as Operation],
      serverInfo: { name: 'orchentra-mcp', version: '0.1.0' },
      approvalPort: serverApprovalPort,
    }
    const mcpRes = await handleHttpRpc(
      authedMcpRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'post_thing', arguments: { body: 'private to org-1' } },
        },
        'org-1',
      ),
      deps,
    )
    const errPayload = JSON.parse(
      ((await mcpRes.json()) as { result: { content: Array<{ text: string }> } }).result.content[0].text,
    ) as {
      docs: string
    }
    const approvalId = (JSON.parse(errPayload.docs) as { approvalId: string }).approvalId

    const ackApp = mountAckApp('org-2', 'human_eve')
    const ackRes = await ackApp.request(`/api/orgs/org-2/approvals/${approvalId}/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    })
    expect(ackRes.status).toBe(404)
  })
})
