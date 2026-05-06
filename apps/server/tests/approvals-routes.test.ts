/**
 * Integration tests for the /api/orgs/:orgId/approvals routes. The router is
 * mounted on a fresh Hono app per test with a stub middleware that injects
 * orgId + user, so we exercise the route logic without bringing up auth.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { approvalsRouter } from '../src/routes/approvals'
import { createApprovalRequest, setApprovalStoreForTesting } from '../src/approvals/store'
import { createMemoryApprovalStore } from '../src/approvals/approvals-memory-store'
import type { AppVariables, UserRow } from '../src/types'

afterAll(() => {
  setApprovalStoreForTesting(null)
})

beforeEach(() => {
  setApprovalStoreForTesting(createMemoryApprovalStore())
})

function buildUser(id: string): UserRow {
  // Stub user row — the route only reads `id`. shoehorn-style cast keeps
  // the test from declaring every column the schema invents.
  return { id } as unknown as UserRow
}

function mountApp(orgId: string, userId: string): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('*', async (c, next) => {
    c.set('orgId', orgId)
    c.set('user', buildUser(userId))
    await next()
  })
  app.route('/api/orgs/:orgId', approvalsRouter)
  return app
}

async function postJson(app: Hono, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /approvals', () => {
  test('lists pending approvals for the requesting org', async () => {
    const a = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: { body: 'hi' },
      requestedBy: { id: 'agent_1', type: 'agent' },
    })
    await createApprovalRequest({
      orgId: 'org-2',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_2', type: 'agent' },
    })

    const app = mountApp('org-1', 'human_alice')
    const res = await app.request('/api/orgs/org-1/approvals?status=pending')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { approvals: Array<{ id: string }> }
    expect(body.approvals).toHaveLength(1)
    expect(body.approvals[0].id).toBe(a.id)
  })

  test('rejects unsupported status query param', async () => {
    const app = mountApp('org-1', 'human_alice')
    const res = await app.request('/api/orgs/org-1/approvals?status=approved')
    expect(res.status).toBe(400)
  })
})

describe('GET /approvals/:id', () => {
  test('returns 404 when fetching an approval from another org', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-2',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_x', type: 'agent' },
    })
    const app = mountApp('org-1', 'human_alice')
    const res = await app.request(`/api/orgs/org-1/approvals/${row.id}`)
    expect(res.status).toBe(404)
  })

  test('returns the row for the owning org', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_x', type: 'agent' },
    })
    const app = mountApp('org-1', 'human_alice')
    const res = await app.request(`/api/orgs/org-1/approvals/${row.id}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { approval: { id: string; status: string } }
    expect(body.approval.id).toBe(row.id)
    expect(body.approval.status).toBe('pending')
  })
})

describe('POST /approvals/:id/ack', () => {
  test('approves a pending request and returns the updated row', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: { body: 'hi' },
      requestedBy: { id: 'agent_x', type: 'agent' },
    })
    const app = mountApp('org-1', 'human_alice')
    const res = await postJson(app, `/api/orgs/org-1/approvals/${row.id}/ack`, { decision: 'approved' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { approval: { status: string; decidedBy: { id: string } | null } }
    expect(body.approval.status).toBe('approved')
    expect(body.approval.decidedBy?.id).toBe('human_alice')
  })

  test('blocks self-approval for destructive trust class', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'force_push',
      trustClass: 'destructive',
      input: {},
      requestedBy: { id: 'human_alice', type: 'user' },
    })
    const app = mountApp('org-1', 'human_alice')
    const res = await postJson(app, `/api/orgs/org-1/approvals/${row.id}/ack`, { decision: 'approved' })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.code).toBe('permission_denied')
    expect(body.error).toContain('second approver')
  })

  test('allows a different approver for destructive trust class', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'force_push',
      trustClass: 'destructive',
      input: {},
      requestedBy: { id: 'human_alice', type: 'user' },
    })
    const app = mountApp('org-1', 'human_bob')
    const res = await postJson(app, `/api/orgs/org-1/approvals/${row.id}/ack`, { decision: 'approved' })
    expect(res.status).toBe(200)
  })

  test('returns 410 when the approval has expired', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_x' },
      expiresAt: new Date(Date.now() - 1000),
    })
    const app = mountApp('org-1', 'human_alice')
    const res = await postJson(app, `/api/orgs/org-1/approvals/${row.id}/ack`, { decision: 'approved' })
    expect(res.status).toBe(410)
  })

  test('returns 409 when the approval is already decided', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_x' },
    })
    const app = mountApp('org-1', 'human_alice')
    const first = await postJson(app, `/api/orgs/org-1/approvals/${row.id}/ack`, { decision: 'approved' })
    expect(first.status).toBe(200)
    const second = await postJson(app, `/api/orgs/org-1/approvals/${row.id}/ack`, { decision: 'denied' })
    expect(second.status).toBe(409)
  })

  test('cross-org leak: org-2 cannot ack org-1s request even if the id is leaked', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_x' },
    })
    const app = mountApp('org-2', 'human_eve')
    const res = await postJson(app, `/api/orgs/org-2/approvals/${row.id}/ack`, { decision: 'approved' })
    expect(res.status).toBe(404)
  })

  test('rejects malformed body', async () => {
    const row = await createApprovalRequest({
      orgId: 'org-1',
      operationId: 'post_comment',
      trustClass: 'write',
      input: {},
      requestedBy: { id: 'agent_x' },
    })
    const app = mountApp('org-1', 'human_alice')
    const res = await postJson(app, `/api/orgs/org-1/approvals/${row.id}/ack`, { decision: 'maybe' })
    expect(res.status).toBe(400)
  })
})
