import { beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createMemoryInstallHandoffStore } from '../src/github/install-handoff-memory-store'
import { createInstallHandoffRouter } from '../src/routes/install-handoff'

interface TestApp {
  app: Hono
  store: ReturnType<typeof createMemoryInstallHandoffStore>
}

function buildApp(): TestApp {
  const store = createMemoryInstallHandoffStore({ now: () => 1_700_000_000_000, ttlMs: 5 * 60_000 })
  const app = new Hono()
  app.route('/api/install-handoff', createInstallHandoffRouter({ store }))
  return { app, store }
}

let app: Hono
let store: ReturnType<typeof createMemoryInstallHandoffStore>

beforeEach(() => {
  const fresh = buildApp()
  app = fresh.app
  store = fresh.store
})

async function post(body: unknown): Promise<Response> {
  return app.request('/api/install-handoff/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/install-handoff/start', () => {
  test('persists a handoff entry and returns 200 ok', async () => {
    const res = await post({ state: 'a'.repeat(32), redirectUri: 'http://127.0.0.1:49281/install-cb' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(store.get('a'.repeat(32))?.redirectUri).toBe('http://127.0.0.1:49281/install-cb')
  })

  test('rejects a non-loopback redirectUri with 400', async () => {
    const cases = [
      'http://evil.com/install-cb',
      'http://localhost:49281/install-cb',
      'http://[::1]:49281/install-cb',
      'https://127.0.0.1:49281/install-cb',
      'http://127.0.0.1:49281/other',
      'http://127.0.0.1/install-cb',
    ]
    let i = 0
    for (const redirectUri of cases) {
      const state = String(i++).padStart(32, 'c')
      const res = await post({ state, redirectUri })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('redirect_uri_not_loopback')
    }
  })

  test('rejects a duplicate state with 409', async () => {
    const first = await post({ state: 'b'.repeat(32), redirectUri: 'http://127.0.0.1:49281/install-cb' })
    expect(first.status).toBe(200)
    const second = await post({ state: 'b'.repeat(32), redirectUri: 'http://127.0.0.1:50000/install-cb' })
    expect(second.status).toBe(409)
    expect((await second.json()).error).toBe('state_in_use')
  })

  test('rejects a too-short state with 400', async () => {
    const res = await post({ state: 'short', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('state_too_short')
  })

  test('rejects a malformed body with 400', async () => {
    const res = await app.request('/api/install-handoff/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })
})
