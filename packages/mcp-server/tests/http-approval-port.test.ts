/**
 * Tests for the MCP HTTP transport's `awaiting_approval` flow. Uses an
 * in-memory ApprovalPort fake — no DB, no apps/server import — so the
 * mcp-server package stays portable.
 */

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import type { Operation } from '@orchentra/operations'
import type { ApprovalPort, ApprovalRequestInput } from '../src/approval-port'
import { handleHttpRpc } from '../src/http-handler'

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

function authedRequest(body: unknown): Request {
  return new Request('https://mcp.example.com/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
      'x-orchentra-org': 'org_abc',
    },
    body: JSON.stringify(body),
  })
}

class FakeApprovalPort implements ApprovalPort {
  recorded: ApprovalRequestInput[] = []
  async requestApproval(input: ApprovalRequestInput): Promise<{ approvalId: string; expiresAt: string }> {
    this.recorded.push(input)
    return { approvalId: `apr_${this.recorded.length}`, expiresAt: '2030-01-01T00:00:00Z' }
  }
}

describe('handleHttpRpc with approvalPort', () => {
  test('write op persists a pending approval and returns awaiting_approval payload', async () => {
    const port = new FakeApprovalPort()
    const deps = {
      operations: [writeOp() as Operation],
      serverInfo: { name: 'x', version: '0' },
      approvalPort: port,
    }
    const res = await handleHttpRpc(
      authedRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'post_thing', arguments: { body: 'audit me' } },
      }),
      deps,
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      result: { content: Array<{ type: string; text: string }>; isError?: boolean }
    }
    expect(body.result.isError).toBe(true)
    const payload = JSON.parse(body.result.content[0].text) as {
      code: string
      message: string
      docs?: string
    }
    expect(payload.code).toBe('awaiting_approval')
    expect(payload.message).toContain('post_thing')
    expect(payload.docs).toBeDefined()
    const docs = JSON.parse(payload.docs as string) as { approvalId: string; expiresAt: string }
    expect(docs.approvalId).toBe('apr_1')
    expect(docs.expiresAt).toBe('2030-01-01T00:00:00Z')

    expect(port.recorded).toHaveLength(1)
    expect(port.recorded[0].orgId).toBe('org_abc')
    expect(port.recorded[0].operationId).toBe('post_thing')
    expect(port.recorded[0].trustClass).toBe('write')
    expect(port.recorded[0].input).toEqual({ body: 'audit me' })
    expect(port.recorded[0].requestedBy).toEqual({ id: 'test-token', type: 'agent' })
  })

  test('read op skips the approval port entirely', async () => {
    const port = new FakeApprovalPort()
    const readOp: Operation<{ q: string }, { hits: number }> = {
      id: 'read_thing',
      description: '',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({ q: z.string() }),
      handler: async () => ({ hits: 7 }),
    }
    const deps = {
      operations: [readOp as Operation],
      serverInfo: { name: 'x', version: '0' },
      approvalPort: port,
    }
    const res = await handleHttpRpc(
      authedRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'read_thing', arguments: { q: 'orchentra' } },
      }),
      deps,
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } }
    expect(body.result.isError).toBe(false)
    expect(port.recorded).toHaveLength(0)
  })

  test('explicit destructive trust class is forwarded to the port', async () => {
    const port = new FakeApprovalPort()
    const op: Operation<{ branch: string }, { ok: true }> = {
      id: 'force_push',
      description: '',
      scope: 'write',
      trustClass: 'destructive',
      localOnly: false,
      mutating: true,
      parameters: z.object({ branch: z.string() }),
      handler: async () => ({ ok: true }),
    }
    const deps = {
      operations: [op as Operation],
      serverInfo: { name: 'x', version: '0' },
      approvalPort: port,
    }
    await handleHttpRpc(
      authedRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'force_push', arguments: { branch: 'main' } },
      }),
      deps,
    )
    expect(port.recorded[0].trustClass).toBe('destructive')
  })
})
