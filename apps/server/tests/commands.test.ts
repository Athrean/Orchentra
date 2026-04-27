import { describe, test, expect, mock, beforeEach } from 'bun:test'

let chatInserts: Record<string, unknown>[] = []

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: [] },
    llm: { api_key: 'sk-or-test', model: 'anthropic/claude-sonnet-4-5' },
  },
}))

let selectCalls: Array<{
  whereClauses: unknown
  limit: number | null
}> = []
let selectRows: Record<string, unknown>[] = []

mock.module('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  and: (...clauses: unknown[]) => ({ op: 'and', clauses: clauses.filter(Boolean) }),
  asc: (col: unknown) => col,
  desc: (col: unknown) => col,
}))

mock.module('../src/db/client', () => ({
  db: {
    insert: () => ({
      values: (val: Record<string, unknown>) => {
        chatInserts.push(val)
        return Promise.resolve([val])
      },
    }),
    select: () => ({
      from: () => ({
        where: (whereClauses: unknown) => ({
          orderBy: () => ({
            limit: (limit: number) => {
              selectCalls.push({ whereClauses, limit })
              return selectRows
            },
          }),
        }),
      }),
    }),
  },
  chatMessages: {},
  incidents: {
    id: { _name: 'id' },
    orgId: { _name: 'org_id' },
    repo: { _name: 'repo' },
    branch: { _name: 'branch' },
    workflowName: { _name: 'workflow_name' },
    status: { _name: 'status' },
    confidence: { _name: 'confidence' },
    triggeredAt: { _name: 'triggered_at' },
  },
}))

const { commandsRouter } = await import('../src/routes/commands')
import { Hono } from 'hono'

function makeApp(): Hono {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('orgId', 'org-1')
    c.set('user', { id: 'user-1' })
    await next()
  })
  app.route('/api/orgs/:orgId', commandsRouter)
  return app
}

beforeEach(() => {
  chatInserts = []
  selectCalls = []
  selectRows = []
})

async function readSseBody(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out + decoder.decode()
}

describe('POST /api/orgs/:orgId/commands', () => {
  test('streams help output for /help', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'help', sessionId: 's1' }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body).toContain('/help')
  })

  test('unknown command returns 400 with the command name in the error', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'nope', sessionId: 's1' }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain('nope')
  })

  test('rejects body without sessionId with 400', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'help' }),
    })
    expect(res.status).toBe(400)
  })

  test('rejects body with oversized command name', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'x'.repeat(200), sessionId: 's1' }),
    })
    expect(res.status).toBe(400)
  })

  test('persists user input and assembled assistant output to chat_messages', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'help', sessionId: 's42' }),
    })

    await readSseBody(res)

    expect(chatInserts).toHaveLength(2)

    const [userRow, assistantRow] = chatInserts as Array<{
      orgId: string
      sessionId: string
      role: 'user' | 'assistant'
      content: string
    }>

    expect(userRow.role).toBe('user')
    expect(userRow.orgId).toBe('org-1')
    expect(userRow.sessionId).toBe('s42')
    expect(userRow.content).toBe('/help')

    expect(assistantRow.role).toBe('assistant')
    expect(assistantRow.sessionId).toBe('s42')
    expect(assistantRow.content).toContain('/help')
  })

  test('/status with no incidents returns empty-state line', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'status', sessionId: 's-empty' }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toContain('no incidents')
  })
})
