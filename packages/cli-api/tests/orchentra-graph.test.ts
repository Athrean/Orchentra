import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test'
import { fetchExecutionGraph, fetchNodeLineage, GraphHttpError, type GraphNodeDto } from '../src/orchentra/graph'

interface CapturedRequest {
  url: string
  init: RequestInit
}

let originalFetch: typeof fetch
let captured: CapturedRequest | null

function makeJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const fakeNode = (overrides: Partial<GraphNodeDto> = {}): GraphNodeDto => ({
  id: 'n1',
  parentNodeId: null,
  kind: 'tool_call',
  integration: 'github',
  round: 1,
  durationMs: 100,
  argsJson: null,
  resultJson: null,
  createdAt: '2026-04-29T00:00:00Z',
  ...overrides,
})

beforeEach(() => {
  originalFetch = globalThis.fetch
  captured = null
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('fetchExecutionGraph', () => {
  test('GETs /api/orgs/:orgId/executions/:id/graph with bearer auth', async () => {
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      captured = { url: url.toString(), init: init ?? {} }
      return makeJsonResponse({ executionId: 'exec-1', nodes: [fakeNode()] })
    }) as unknown as typeof fetch

    const result = await fetchExecutionGraph({
      serverUrl: 'https://api.example.com',
      orgId: 'org-1',
      apiKey: 'sk-test',
      executionId: 'exec-1',
    })

    expect(captured?.url).toBe('https://api.example.com/api/orgs/org-1/executions/exec-1/graph')
    expect((captured?.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
    expect(result.executionId).toBe('exec-1')
    expect(result.nodes).toHaveLength(1)
  })

  test('strips trailing slashes from serverUrl', async () => {
    globalThis.fetch = mock(async (url: string | URL) => {
      captured = { url: url.toString(), init: {} }
      return makeJsonResponse({ executionId: 'e', nodes: [] })
    }) as unknown as typeof fetch

    await fetchExecutionGraph({
      serverUrl: 'https://api.example.com//',
      orgId: 'org-1',
      apiKey: 'sk-test',
      executionId: 'e',
    })

    expect(captured?.url).toBe('https://api.example.com/api/orgs/org-1/executions/e/graph')
  })

  test('throws GraphHttpError on non-2xx with server-supplied error message', async () => {
    globalThis.fetch = mock(async () =>
      makeJsonResponse({ error: 'Execution not found' }, 404),
    ) as unknown as typeof fetch

    let err: unknown
    try {
      await fetchExecutionGraph({
        serverUrl: 'https://api.example.com',
        orgId: 'org-1',
        apiKey: 'sk-test',
        executionId: 'missing',
      })
    } catch (e) {
      err = e
    }

    expect(err).toBeInstanceOf(GraphHttpError)
    expect((err as GraphHttpError).status).toBe(404)
    expect((err as GraphHttpError).message).toContain('Execution not found')
  })

  test('url-encodes ids that contain reserved characters', async () => {
    globalThis.fetch = mock(async (url: string | URL) => {
      captured = { url: url.toString(), init: {} }
      return makeJsonResponse({ executionId: '', nodes: [] })
    }) as unknown as typeof fetch

    await fetchExecutionGraph({
      serverUrl: 'https://api.example.com',
      orgId: 'org/1',
      apiKey: 'sk',
      executionId: 'exec 1',
    })

    expect(captured?.url).toContain('org%2F1')
    expect(captured?.url).toContain('exec%201')
  })
})

describe('fetchNodeLineage', () => {
  test('GETs /api/orgs/:orgId/nodes/:id/lineage and returns lineage payload', async () => {
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      captured = { url: url.toString(), init: init ?? {} }
      return makeJsonResponse({
        node: fakeNode({ id: 'leaf', parentNodeId: 'mid' }),
        ancestors: [fakeNode({ id: 'root' }), fakeNode({ id: 'mid', parentNodeId: 'root' })],
      })
    }) as unknown as typeof fetch

    const result = await fetchNodeLineage({
      serverUrl: 'https://api.example.com',
      orgId: 'org-1',
      apiKey: 'sk-test',
      nodeId: 'leaf',
    })

    expect(captured?.url).toBe('https://api.example.com/api/orgs/org-1/nodes/leaf/lineage')
    expect(result.node.id).toBe('leaf')
    expect(result.ancestors).toHaveLength(2)
  })

  test('throws GraphHttpError on 404', async () => {
    globalThis.fetch = mock(async () => makeJsonResponse({ error: 'Node not found' }, 404)) as unknown as typeof fetch

    let err: unknown
    try {
      await fetchNodeLineage({
        serverUrl: 'https://api.example.com',
        orgId: 'org-1',
        apiKey: 'sk-test',
        nodeId: 'missing',
      })
    } catch (e) {
      err = e
    }

    expect(err).toBeInstanceOf(GraphHttpError)
    expect((err as GraphHttpError).status).toBe(404)
  })
})
