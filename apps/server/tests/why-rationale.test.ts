/**
 * Locks the second half of the Phase 3 verification gate (CLAUDE.md §2):
 *   "`orchentra why <nodeId>` matches rationale logged in `nodes.argsJson`".
 *
 * Drives `GET /api/orgs/:orgId/nodes/:id/lineage` — the same endpoint the CLI
 * `fetchNodeLineage` HTTP client hits — and asserts that `argsJson` and
 * `resultJson` round-trip byte-for-byte through the route, plus that the
 * ancestor chain walks `parent_node_id` in root-first order.
 *
 * No new instrumentation is exercised here (CLAUDE.md §10): the route reads
 * the same text columns the engine writes at execution time. The test mocks
 * `db/client` so the queries layer + route layer are exercised verbatim.
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { drizzleMockBase } from './helpers/drizzle-mock'
import { dbClientMockBase } from './helpers/db-client-mock'
import { incidentsQueriesMockBase } from './helpers/incidents-queries-mock'

// --- Fixture state ---

interface FixtureNode {
  id: string
  parentNodeId: string | null
  incidentId: string | null
  kind: string
  integration: string
  round: number
  durationMs: number | null
  argsJson: string | null
  resultJson: string | null
  createdAt: Date
}

interface FixtureExecution {
  id: string
  orgId: string
}

let fixtureNodes: FixtureNode[] = []
let fixtureExecutions: FixtureExecution[] = []

// --- Mocks ---

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: [] },
    llm: { api_key: 'sk-test', model: 'anthropic/claude-sonnet-4-5' },
  },
}))

mock.module('drizzle-orm', () => ({
  ...drizzleMockBase(),
  // Capture (column, value) so the mock db can route queries by parameter.
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  and: (...clauses: unknown[]) => ({ op: 'and', clauses: clauses.filter(Boolean) }),
  asc: (col: unknown) => col,
}))

// Sentinel column references — identity equality is used by the mock to
// discriminate which column an `eq(...)` was made against.
const NODES_ID = { __col: 'nodes.id' }
const NODES_INCIDENT_ID = { __col: 'nodes.incident_id' }
const EXECUTIONS_ID = { __col: 'executions.id' }
const EXECUTIONS_ORG_ID = { __col: 'executions.org_id' }

// Sentinel table refs.
const NODES_TABLE = { __table: 'nodes' }
const EXECUTIONS_TABLE = { __table: 'executions' }

interface EqClause {
  op: 'eq'
  col: unknown
  val: unknown
}
interface AndClause {
  op: 'and'
  clauses: EqClause[]
}

function flattenWhere(where: unknown): EqClause[] {
  if (!where || typeof where !== 'object') return []
  const w = where as Partial<EqClause & AndClause>
  if (w.op === 'and') return (w.clauses ?? []).flatMap(flattenWhere)
  if (w.op === 'eq') return [w as EqClause]
  return []
}

function valueFor(clauses: EqClause[], col: unknown): unknown {
  for (const c of clauses) if (c.col === col) return c.val
  return undefined
}

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (where: unknown) => {
          const clauses = flattenWhere(where)

          // Build a lazily-resolved query so .limit(n) and the no-.limit
          // forms both work — getNodeLineage uses both.
          const resolve = (limit: number | null): Array<Record<string, unknown>> => {
            if (table === NODES_TABLE) {
              const id = valueFor(clauses, NODES_ID)
              const incidentId = valueFor(clauses, NODES_INCIDENT_ID)
              let rows = fixtureNodes
              if (id !== undefined) rows = rows.filter((n) => n.id === id)
              if (incidentId !== undefined) rows = rows.filter((n) => n.incidentId === incidentId)
              return limit !== null ? rows.slice(0, limit) : rows
            }
            if (table === EXECUTIONS_TABLE) {
              const id = valueFor(clauses, EXECUTIONS_ID)
              const orgId = valueFor(clauses, EXECUTIONS_ORG_ID)
              const rows = fixtureExecutions.filter(
                (e) => (id === undefined || e.id === id) && (orgId === undefined || e.orgId === orgId),
              )
              return limit !== null ? rows.slice(0, limit) : rows
            }
            return []
          }

          const chain = {
            limit: (n: number) => Promise.resolve(resolve(n)),
            orderBy: () => Promise.resolve(resolve(null)),
            then: (onFulfilled: (rows: Array<Record<string, unknown>>) => unknown) =>
              Promise.resolve(resolve(null)).then(onFulfilled),
          }
          return chain
        },
      }),
    }),
  },
  nodes: Object.assign(NODES_TABLE, {
    id: NODES_ID,
    incidentId: NODES_INCIDENT_ID,
    parentNodeId: { __col: 'nodes.parent_node_id' },
    kind: { __col: 'nodes.kind' },
    integration: { __col: 'nodes.integration' },
    round: { __col: 'nodes.round' },
    durationMs: { __col: 'nodes.duration_ms' },
    argsJson: { __col: 'nodes.args_json' },
    resultJson: { __col: 'nodes.result_json' },
    createdAt: { __col: 'nodes.created_at' },
  }),
  executions: Object.assign(EXECUTIONS_TABLE, {
    id: EXECUTIONS_ID,
    orgId: EXECUTIONS_ORG_ID,
    kind: { __col: 'executions.kind' },
    status: { __col: 'executions.status' },
    repo: { __col: 'executions.repo' },
    branch: { __col: 'executions.branch' },
    triggeredAt: { __col: 'executions.triggered_at' },
    mttrSeconds: { __col: 'executions.mttr_seconds' },
    createdAt: { __col: 'executions.created_at' },
  }),
}))

mock.module('../src/queries/incidents', () => ({
  ...incidentsQueriesMockBase(),
}))

// Drizzle row mappings — `db.select({ id: nodes.id, ... })` would normally
// produce rows keyed by the alias, but because our mock returns raw fixture
// rows whose property names already match the aliased keys (`id`,
// `parentNodeId`, `argsJson`, `resultJson`, etc.), the queries layer reads
// them transparently. This holds because `NODE_COLUMNS` aliases match the
// FixtureNode field names.

const { incidentsRouter } = await import('../src/routes/incidents')

function makeApp(orgId: string): Hono {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('orgId', orgId)
    await next()
  })
  app.route('/api/orgs/:orgId', incidentsRouter)
  return app
}

const ORG_ID = 'org-1'
const EXEC_ID = 'exec-001'

const ROOT_ARGS = JSON.stringify({
  trigger: 'workflow_run',
  payload: {
    runId: 12345,
    branch: 'main',
    flags: [true, false, null],
    depth: 0,
    note: 'kickoff "with quotes" + emoji',
  },
})
const ROOT_RESULT = JSON.stringify({ ok: true, nextNode: 'child', meta: null })

const CHILD_ARGS = JSON.stringify({
  tool: 'github.fetch_logs',
  args: { runId: 12345, jobId: null, attempts: [1, 2, 3], filters: { status: 'failure' } },
})
const CHILD_RESULT = JSON.stringify({ stepCount: 7, errorLine: 4242, snippet: '\nERROR: ENOENT\n' })

const GRANDCHILD_ARGS = JSON.stringify({
  rationale: 'narrowed to env var miss; cross-checking secrets',
  observations: { matched: 1, total: 12, ratio: 0.083, candidates: ['DATABASE_URL', null] },
})
const GRANDCHILD_RESULT = JSON.stringify({
  verdict: 'env_missing',
  confidence: 0.92,
  fix: { kind: 'secret', name: 'DATABASE_URL' },
})

const ROOT_ID = 'node-root'
const CHILD_ID = 'node-child'
const GRANDCHILD_ID = 'node-grandchild'

function seedDag(): void {
  fixtureExecutions = [{ id: EXEC_ID, orgId: ORG_ID }]
  fixtureNodes = [
    {
      id: ROOT_ID,
      parentNodeId: null,
      incidentId: EXEC_ID,
      kind: 'tool_call',
      integration: 'system',
      round: 0,
      durationMs: 12,
      argsJson: ROOT_ARGS,
      resultJson: ROOT_RESULT,
      createdAt: new Date('2026-05-05T00:00:00Z'),
    },
    {
      id: CHILD_ID,
      parentNodeId: ROOT_ID,
      incidentId: EXEC_ID,
      kind: 'tool_call',
      integration: 'github',
      round: 1,
      durationMs: 88,
      argsJson: CHILD_ARGS,
      resultJson: CHILD_RESULT,
      createdAt: new Date('2026-05-05T00:00:01Z'),
    },
    {
      id: GRANDCHILD_ID,
      parentNodeId: CHILD_ID,
      incidentId: EXEC_ID,
      kind: 'tool_call',
      integration: 'agent',
      round: 2,
      durationMs: 145,
      argsJson: GRANDCHILD_ARGS,
      resultJson: GRANDCHILD_RESULT,
      createdAt: new Date('2026-05-05T00:00:02Z'),
    },
  ]
}

beforeEach(() => {
  seedDag()
})

interface LineagePayload {
  node: FixtureNode
  ancestors: FixtureNode[]
}

async function fetchLineage(
  nodeId: string,
  orgId = ORG_ID,
): Promise<{ status: number; body: LineagePayload | { error: string } }> {
  const app = makeApp(orgId)
  const res = await app.request(`/api/orgs/${orgId}/nodes/${nodeId}/lineage`)
  const body = (await res.json()) as LineagePayload | { error: string }
  return { status: res.status, body }
}

describe('GET /api/orgs/:orgId/nodes/:id/lineage — why-rationale round-trip', () => {
  test('returns the target node with argsJson + resultJson byte-for-byte', async () => {
    const { status, body } = await fetchLineage(GRANDCHILD_ID)
    expect(status).toBe(200)
    const payload = body as LineagePayload
    expect(payload.node.id).toBe(GRANDCHILD_ID)
    expect(payload.node.argsJson).toBe(GRANDCHILD_ARGS)
    expect(payload.node.resultJson).toBe(GRANDCHILD_RESULT)
  })

  test('walks parent_node_id in root-first order', async () => {
    const { body } = await fetchLineage(GRANDCHILD_ID)
    const payload = body as LineagePayload
    expect(payload.ancestors.map((n) => n.id)).toEqual([ROOT_ID, CHILD_ID])
  })

  test('preserves each ancestor argsJson + resultJson byte-for-byte', async () => {
    const { body } = await fetchLineage(GRANDCHILD_ID)
    const payload = body as LineagePayload
    const [root, child] = payload.ancestors
    expect(root.argsJson).toBe(ROOT_ARGS)
    expect(root.resultJson).toBe(ROOT_RESULT)
    expect(child.argsJson).toBe(CHILD_ARGS)
    expect(child.resultJson).toBe(CHILD_RESULT)
  })

  test('round-trip preserves nested objects, arrays, nulls, booleans, numbers', async () => {
    const { body } = await fetchLineage(GRANDCHILD_ID)
    const payload = body as LineagePayload
    // Re-parse and structurally compare so a future regression that
    // re-serialises (e.g. JSON.parse + JSON.stringify with key reordering)
    // is also caught — byte-equality above already enforces no reordering.
    expect(JSON.parse(payload.node.argsJson!)).toEqual(JSON.parse(GRANDCHILD_ARGS))
    expect(JSON.parse(payload.node.resultJson!)).toEqual(JSON.parse(GRANDCHILD_RESULT))
  })

  test('lineage of the root node returns an empty ancestors list', async () => {
    const { status, body } = await fetchLineage(ROOT_ID)
    expect(status).toBe(200)
    const payload = body as LineagePayload
    expect(payload.node.id).toBe(ROOT_ID)
    expect(payload.ancestors).toEqual([])
    expect(payload.node.argsJson).toBe(ROOT_ARGS)
    expect(payload.node.resultJson).toBe(ROOT_RESULT)
  })

  test('returns 404 for an unknown node id', async () => {
    const { status, body } = await fetchLineage('node-does-not-exist')
    expect(status).toBe(404)
    expect((body as { error: string }).error).toBe('Node not found')
  })

  test('returns 404 when the node belongs to a different org', async () => {
    const { status } = await fetchLineage(GRANDCHILD_ID, 'other-org')
    expect(status).toBe(404)
  })
})
