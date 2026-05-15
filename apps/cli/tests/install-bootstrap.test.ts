import { describe, expect, test } from 'bun:test'
import { runInstallBootstrap, type BootstrapDeps, type BootstrapResult } from '../src/auth/install-bootstrap'
import type { LoopbackServer } from '../src/auth/loopback-server'

interface FakeFetchCall {
  url: string
  init?: RequestInit
}

function fakeLoopback(payload: {
  orgId?: string
  installationId?: number
  apiKey?: string
  error?: string
}): LoopbackServer {
  return {
    port: 49281,
    waitForCallback: async () => payload,
    stop: () => undefined,
  }
}

function makeDeps(overrides: Partial<BootstrapDeps> = {}): {
  deps: BootstrapDeps
  fetchCalls: FakeFetchCall[]
  browserCalls: string[]
  writeCalls: { cwd: string; orgId: string; serverUrl: string }[]
  saveCalls: string[]
} {
  const fetchCalls: FakeFetchCall[] = []
  const browserCalls: string[] = []
  const writeCalls: { cwd: string; orgId: string; serverUrl: string }[] = []
  const saveCalls: string[] = []

  const deps: BootstrapDeps = {
    serverUrl: 'http://localhost:3001',
    owner: 'Athrean',
    appSlug: 'orchentra',
    cwd: '/tmp/fake-cwd',
    timeoutMs: 5000,
    randomState: () => 'a'.repeat(48),
    openBrowser: async (url: string) => {
      browserCalls.push(url)
    },
    makeLoopback: async () => fakeLoopback({ orgId: 'Athrean', installationId: 12345, apiKey: 'plaintext-key' }),
    fetch: (async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch,
    writeSettings: (input) => {
      writeCalls.push({ cwd: input.cwd, orgId: input.orgId, serverUrl: input.serverUrl ?? '' })
      return '/tmp/fake-cwd/.orchentra/settings.json'
    },
    saveApiKey: (apiKey: string) => {
      saveCalls.push(apiKey)
      return '/home/u/.config/orchentra/credentials.json'
    },
    ...overrides,
  }
  return { deps, fetchCalls, browserCalls, writeCalls, saveCalls }
}

describe('runInstallBootstrap', () => {
  test('happy path: registers handoff, opens browser, persists payload', async () => {
    const { deps, fetchCalls, browserCalls, writeCalls, saveCalls } = makeDeps()
    const result: BootstrapResult = await runInstallBootstrap(deps)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.orgId).toBe('Athrean')
    expect(result.installationId).toBe(12345)

    expect(fetchCalls.length).toBe(1)
    expect(fetchCalls[0].url).toBe('http://localhost:3001/api/install-handoff/start')
    const body = JSON.parse(String(fetchCalls[0].init?.body ?? '{}'))
    expect(body.state).toBe('a'.repeat(48))
    expect(body.redirectUri).toBe('http://127.0.0.1:49281/install-cb')

    expect(browserCalls.length).toBe(1)
    expect(browserCalls[0]).toBe(`https://github.com/apps/orchentra/installations/new?state=${'a'.repeat(48)}`)

    expect(writeCalls).toEqual([{ cwd: '/tmp/fake-cwd', orgId: 'Athrean', serverUrl: 'http://localhost:3001' }])
    expect(saveCalls).toEqual(['plaintext-key'])
  })

  test('surfaces a loopback error payload as a failed BootstrapResult', async () => {
    const { deps } = makeDeps({
      makeLoopback: async () => fakeLoopback({ error: 'invalid_state' }),
    })
    const result = await runInstallBootstrap(deps)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('invalid_state')
  })

  test('returns failure when /api/install-handoff/start returns 409', async () => {
    const { deps } = makeDeps({
      fetch: (async () => new Response(JSON.stringify({ error: 'state_in_use' }), { status: 409 })) as typeof fetch,
    })
    const result = await runInstallBootstrap(deps)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('state_in_use')
  })

  test('returns failure when /api/install-handoff/start is unreachable', async () => {
    const { deps } = makeDeps({
      fetch: (async () => {
        throw new TypeError('fetch failed')
      }) as typeof fetch,
    })
    const result = await runInstallBootstrap(deps)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('server unreachable')
  })

  test('returns failure when loopback rejects (timeout)', async () => {
    const { deps } = makeDeps({
      makeLoopback: async () => ({
        port: 49281,
        waitForCallback: () => Promise.reject(new Error('loopback timeout after 5000ms')),
        stop: () => undefined,
      }),
    })
    const result = await runInstallBootstrap(deps)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('timeout')
  })
})
