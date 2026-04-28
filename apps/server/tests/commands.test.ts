import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { drizzleMockBase } from './helpers/drizzle-mock'
import { dbClientMockBase } from './helpers/db-client-mock'
import { EventEmitter } from 'events'
import { aiMockBase } from './helpers/ai-mock'
import { llmMockBase } from './helpers/llm-mock'
import { incidentsQueriesMockBase } from './helpers/incidents-queries-mock'

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
  ...drizzleMockBase(),
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  and: (...clauses: unknown[]) => ({ op: 'and', clauses: clauses.filter(Boolean) }),
  asc: (col: unknown) => col,
  desc: (col: unknown) => col,
}))

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
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

interface FixtureIncident {
  id: string
  orgId: string
  repo: string
  workflowRunId: number | null
  status: string
}

const enqueueCalls: FixtureIncident[] = []
const incidentsById = new Map<string, FixtureIncident>()
const incidentsByRunId = new Map<string, FixtureIncident>()
const triageBus = new EventEmitter()
triageBus.setMaxListeners(0)

mock.module('../src/lib/incident-queue', () => ({
  enqueueInvestigateJob: async (incident: FixtureIncident) => {
    enqueueCalls.push(incident)
  },
}))

const incidentResets: Array<{ id: string; orgId: string }> = []
let modelCalls: Array<{ system?: string; messages: unknown }> = []
let modelOutput = ''

mock.module('ai', () => ({
  ...aiMockBase(),
  streamText: ({ system, messages }: { system?: string; messages: unknown }) => {
    modelCalls.push({ system, messages })
    return {
      textStream: (async function* () {
        for (const chunk of modelOutput.match(/.{1,8}/g) ?? []) yield chunk
      })(),
    }
  },
}))

mock.module('../src/agent/llm', () => ({
  ...llmMockBase(),
  createModel: () => ({}),
}))

mock.module('../src/queries/incidents', () => ({
  ...incidentsQueriesMockBase(),
  findIncident: async (id: string, orgId: string) => {
    const row = incidentsById.get(id)
    if (!row || row.orgId !== orgId) return undefined
    return row
  },
  findIncidentByRunId: async (orgId: string, repo: string, runId: number) => {
    return incidentsByRunId.get(`${orgId}:${repo}:${runId}`) ?? undefined
  },
  resetIncidentForRetry: async (id: string, orgId: string) => {
    incidentResets.push({ id, orgId })
    const row = incidentsById.get(id)
    if (row) row.status = 'investigating'
  },
}))

mock.module('../src/events', () => ({
  incidentEvents: Object.assign(triageBus, {
    emitIncidentEvent: (event: { type: string }) => {
      triageBus.emit(event.type, event)
      triageBus.emit('*', event)
    },
  }),
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
  enqueueCalls.length = 0
  incidentsById.clear()
  incidentsByRunId.clear()
  incidentResets.length = 0
  modelCalls = []
  modelOutput = ''
  triageBus.removeAllListeners()
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

  test('/status renders a row per incident with status glyph, repo, branch, workflow, confidence and ago', async () => {
    selectRows = [
      {
        id: 'inc-1',
        repo: 'acme/api',
        branch: 'main',
        workflowName: 'CI',
        status: 'investigating',
        confidence: 0.82,
        triggeredAt: new Date(Date.now() - 5 * 60 * 1000),
      },
      {
        id: 'inc-2',
        repo: 'acme/web',
        branch: 'feat/x',
        workflowName: 'tests',
        status: 'fixing',
        confidence: null,
        triggeredAt: new Date(Date.now() - 90 * 60 * 1000),
      },
    ]
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'status', sessionId: 's-rows' }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body).toContain('acme/api')
    expect(body).toContain('main')
    expect(body).toContain('CI')
    expect(body).toContain('82%')
    expect(body).toContain('5m ago')
    expect(body).toContain('acme/web')
    expect(body).toContain('feat/x')
    expect(body).toContain('1h ago')
    expect(body).toContain('— 2 incidents')
  })

  test('/status passes --repo and --status filters into the incidents query', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'status',
        args: ['--repo', 'Acme/API', '--status', 'fixing', '--limit', '5'],
        sessionId: 's-filter',
      }),
    })

    expect(res.status).toBe(200)
    await readSseBody(res)

    expect(selectCalls).toHaveLength(1)
    const call = selectCalls[0]
    expect(call.limit).toBe(5)

    const where = call.whereClauses as { op: string; clauses: Array<{ op: string; val: unknown }> }
    expect(where.op).toBe('and')
    const values = where.clauses.map((c) => c.val)
    expect(values).toContain('org-1')
    expect(values).toContain('acme/api')
    expect(values).toContain('fixing')
  })

  function emitTerminal(incidentId: string, repo = 'acme/api'): void {
    triageBus.emit('*', {
      type: 'incident:status_changed',
      incidentId,
      orgId: 'org-1',
      repo,
      data: { status: 'resolved' },
    })
  }

  test('/triage <uuid> enqueues the existing incident and yields a header', async () => {
    const inc: FixtureIncident = {
      id: '11111111-1111-4111-8111-111111111111',
      orgId: 'org-1',
      repo: 'acme/api',
      workflowRunId: 99,
      status: 'investigating',
    }
    incidentsById.set(inc.id, inc)

    const app = makeApp()
    const resPromise = app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'triage',
        args: [inc.id],
        sessionId: 's-triage-uuid',
      }),
    })
    setTimeout(() => emitTerminal(inc.id, inc.repo), 5)
    const res = await resPromise

    expect(res.status).toBe(200)
    const body = await readSseBody(res)

    expect(enqueueCalls).toHaveLength(1)
    expect(enqueueCalls[0].id).toBe(inc.id)
    expect(body.toLowerCase()).toContain('triag')
    expect(body).toContain(inc.id)
    expect(body).toContain('queued')
  })

  test('/triage <owner/repo> <runId> resolves the incident and enqueues', async () => {
    const inc: FixtureIncident = {
      id: '22222222-2222-4222-8222-222222222222',
      orgId: 'org-1',
      repo: 'acme/api',
      workflowRunId: 4242,
      status: 'investigating',
    }
    incidentsByRunId.set('org-1:acme/api:4242', inc)

    const app = makeApp()
    const resPromise = app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'triage',
        args: ['Acme/API', '4242'],
        sessionId: 's-triage-runid',
      }),
    })
    setTimeout(() => emitTerminal(inc.id, inc.repo), 5)
    const res = await resPromise

    expect(res.status).toBe(200)
    await readSseBody(res)

    expect(enqueueCalls).toHaveLength(1)
    expect(enqueueCalls[0].id).toBe(inc.id)
  })

  test('/triage with no args yields an error frame, no enqueue', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'triage', sessionId: 's-triage-empty' }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toContain('error')
    expect(enqueueCalls).toHaveLength(0)
  })

  test('/triage with unknown UUID yields not-found error, no enqueue', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'triage',
        args: ['33333333-3333-4333-8333-333333333333'],
        sessionId: 's-triage-missing',
      }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toContain('not found')
    expect(enqueueCalls).toHaveLength(0)
  })

  test('/triage streams incidentEvents for the target incident and closes on terminal status', async () => {
    const inc: FixtureIncident = {
      id: '55555555-5555-4555-8555-555555555555',
      orgId: 'org-1',
      repo: 'acme/api',
      workflowRunId: 7,
      status: 'investigating',
    }
    const otherInc: FixtureIncident = {
      id: '66666666-6666-4666-8666-666666666666',
      orgId: 'org-1',
      repo: 'acme/web',
      workflowRunId: 8,
      status: 'investigating',
    }
    incidentsById.set(inc.id, inc)
    incidentsById.set(otherInc.id, otherInc)

    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'triage',
        args: [inc.id],
        sessionId: 's-triage-stream',
      }),
    })
    expect(res.status).toBe(200)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let body = ''

    const drainOnce = async (): Promise<void> => {
      const { value, done } = await reader.read()
      if (!done && value) body += decoder.decode(value, { stream: true })
    }

    await drainOnce()

    triageBus.emit('*', {
      type: 'incident:updated',
      incidentId: otherInc.id,
      orgId: 'org-1',
      repo: otherInc.repo,
      data: { note: 'should be ignored' },
    })
    triageBus.emit('*', {
      type: 'incident:updated',
      incidentId: inc.id,
      orgId: 'org-1',
      repo: inc.repo,
      data: { tool: 'github.fetch_logs' },
    })
    await drainOnce()

    triageBus.emit('*', {
      type: 'incident:status_changed',
      incidentId: inc.id,
      orgId: 'org-1',
      repo: inc.repo,
      data: { status: 'resolved' },
    })

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()

    expect(body).toContain('incident:updated')
    expect(body).toContain('resolved')
    expect(body).not.toContain(otherInc.id)
    expect(triageBus.listenerCount('*')).toBe(0)
  })

  test('/retry on errored incident resets fields and enqueues', async () => {
    const inc: FixtureIncident = {
      id: '77777777-7777-4777-8777-777777777777',
      orgId: 'org-1',
      repo: 'acme/api',
      workflowRunId: 11,
      status: 'error',
    }
    incidentsById.set(inc.id, inc)

    const app = makeApp()
    const resPromise = app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'retry',
        args: [inc.id],
        sessionId: 's-retry-ok',
      }),
    })
    setTimeout(() => emitTerminal(inc.id, inc.repo), 5)
    const res = await resPromise

    expect(res.status).toBe(200)
    const body = await readSseBody(res)

    expect(incidentResets).toHaveLength(1)
    expect(incidentResets[0].id).toBe(inc.id)
    expect(enqueueCalls).toHaveLength(1)
    expect(enqueueCalls[0].id).toBe(inc.id)
    expect(body.toLowerCase()).toContain('retry')
    expect(body).toContain(inc.id)
  })

  test('/retry on resolved incident is rejected, no reset, no enqueue', async () => {
    const inc: FixtureIncident = {
      id: '88888888-8888-4888-8888-888888888888',
      orgId: 'org-1',
      repo: 'acme/api',
      workflowRunId: 12,
      status: 'resolved',
    }
    incidentsById.set(inc.id, inc)

    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'retry',
        args: [inc.id],
        sessionId: 's-retry-resolved',
      }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toMatch(/not retryable|cannot retry|status/)
    expect(incidentResets).toHaveLength(0)
    expect(enqueueCalls).toHaveLength(0)
  })

  test('/retry with unknown UUID returns not found', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'retry',
        args: ['99999999-9999-4999-8999-999999999999'],
        sessionId: 's-retry-missing',
      }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toContain('not found')
    expect(incidentResets).toHaveLength(0)
    expect(enqueueCalls).toHaveLength(0)
  })

  test('/explain on an incident with a brief streams a prose answer from the model', async () => {
    const inc = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      orgId: 'org-1',
      repo: 'acme/api',
      workflowRunId: 21,
      status: 'resolved',
      briefJson: JSON.stringify({
        rootCause: 'npm install hit ETIMEDOUT against the registry',
        suggestedFix: 'pin npm to 10.5 in CI and add a 120s install timeout',
      }),
      failedStep: 'install dependencies',
    }
    incidentsById.set(inc.id, inc as unknown as FixtureIncident)

    modelOutput = 'The CI run timed out talking to the npm registry. Pin npm and bump the install timeout.'

    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'explain',
        args: [inc.id],
        sessionId: 's-explain-ok',
      }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)

    expect(modelCalls).toHaveLength(1)
    const call = modelCalls[0]
    expect(call.system).toMatch(/plain.*english|prose|sentences|incident/i)
    expect(JSON.stringify(call.messages)).toContain('npm install')

    expect(body).toContain('timed out')
    expect(body).toContain('Pin npm')
  })

  test('/explain with no brief returns a hint and does not call the model', async () => {
    const inc = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      orgId: 'org-1',
      repo: 'acme/api',
      workflowRunId: 22,
      status: 'investigating',
      briefJson: null,
    }
    incidentsById.set(inc.id, inc as unknown as FixtureIncident)

    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'explain',
        args: [inc.id],
        sessionId: 's-explain-no-brief',
      }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toMatch(/still running|no brief|investigation/i)
    expect(body).toContain('/status')
    expect(modelCalls).toHaveLength(0)
  })

  test('/explain with unknown UUID returns not found, no model call', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'explain',
        args: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
        sessionId: 's-explain-missing',
      }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toContain('not found')
    expect(modelCalls).toHaveLength(0)
  })

  test('/triage cross-org incident lookup returns not-found', async () => {
    const inc: FixtureIncident = {
      id: '44444444-4444-4444-8444-444444444444',
      orgId: 'other-org',
      repo: 'acme/api',
      workflowRunId: 1,
      status: 'investigating',
    }
    incidentsById.set(inc.id, inc)

    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'triage',
        args: [inc.id],
        sessionId: 's-triage-xorg',
      }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toContain('not found')
    expect(enqueueCalls).toHaveLength(0)
  })

  test('/status with invalid --status emits an error frame (not a 500)', async () => {
    const app = makeApp()
    const res = await app.request('/api/orgs/org-1/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'status',
        args: ['--status', 'on-fire'],
        sessionId: 's-bad-status',
      }),
    })

    expect(res.status).toBe(200)
    const body = await readSseBody(res)
    expect(body.toLowerCase()).toContain('error')
    expect(selectCalls).toHaveLength(0)
  })
})
