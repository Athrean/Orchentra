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
      const str = String(url)
      fetchCalls.push({ url: str, init })
      // Default: by-owner returns 404 (fresh path) so the happy-path
      // test continues to exercise the install/new branch.
      if (str.includes('/api/installations/by-owner/')) {
        return new Response(JSON.stringify({ error: 'not_installed' }), { status: 404 })
      }
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

    expect(fetchCalls.length).toBe(2)
    expect(fetchCalls[0].url).toBe('http://localhost:3001/api/installations/by-owner/Athrean')
    expect(fetchCalls[1].url).toBe('http://localhost:3001/api/install-handoff/start')
    const body = JSON.parse(String(fetchCalls[1].init?.body ?? '{}'))
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

  test('already-installed branch: by-owner 200 → opens configure URL with installationId', async () => {
    const fetchUrls: string[] = []
    const browserUrls: string[] = []
    const { deps } = makeDeps({
      openBrowser: async (url) => {
        browserUrls.push(url)
      },
      fetch: (async (url: string | URL, init?: RequestInit) => {
        const str = String(url)
        fetchUrls.push(str)
        if (str.endsWith('/api/installations/by-owner/Athrean')) {
          return new Response(
            JSON.stringify({
              orgId: 'Athrean',
              installationId: 99999,
              installedAt: '2026-05-01T00:00:00Z',
              suspendedAt: null,
            }),
            { status: 200 },
          )
        }
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }) as typeof fetch,
    })
    const result = await runInstallBootstrap(deps)
    expect(result.ok).toBe(true)
    expect(fetchUrls).toContain('http://localhost:3001/api/installations/by-owner/Athrean')
    expect(browserUrls[0]).toBe(`https://github.com/apps/orchentra/installations/99999?state=${'a'.repeat(48)}`)
  })

  test('by-owner 404 falls through to fresh-install URL (install/new)', async () => {
    const browserUrls: string[] = []
    const { deps } = makeDeps({
      openBrowser: async (url) => {
        browserUrls.push(url)
      },
      fetch: (async (url: string | URL, init?: RequestInit) => {
        const str = String(url)
        if (str.includes('/api/installations/by-owner/')) {
          return new Response(JSON.stringify({ error: 'not_installed' }), { status: 404 })
        }
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }) as typeof fetch,
    })
    const result = await runInstallBootstrap(deps)
    expect(result.ok).toBe(true)
    expect(browserUrls[0]).toContain('/installations/new?state=')
  })

  test('by-owner 5xx degrades to fresh-install URL', async () => {
    const browserUrls: string[] = []
    const { deps } = makeDeps({
      openBrowser: async (url) => {
        browserUrls.push(url)
      },
      fetch: (async (url: string | URL, init?: RequestInit) => {
        const str = String(url)
        if (str.includes('/api/installations/by-owner/')) {
          return new Response('boom', { status: 500 })
        }
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }) as typeof fetch,
    })
    const result = await runInstallBootstrap(deps)
    expect(result.ok).toBe(true)
    expect(browserUrls[0]).toContain('/installations/new?state=')
  })
})
