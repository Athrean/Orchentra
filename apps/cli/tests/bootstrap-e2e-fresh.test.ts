/**
 * End-to-end tracer-bullet for slice 1 of #374 — fresh install path.
 *
 * Spins up:
 *   - a real Bun.serve HTTP server emulating /api/install-handoff/start and
 *     /auth/github/app/callback. The handler contract matches the install
 *     handoff routes; inlining it here keeps the CLI test self-contained and
 *     from reaching across packages.
 *   - a real loopback receiver via startLoopback().
 *   - the real bootstrap orchestrator pointed at the ephemeral server.
 *
 * The "browser" step is simulated by a fakeBrowser that issues the GH
 * callback fetch on the orchestrator's behalf, exactly as a redirected
 * browser would. After success we assert settings.json + apiKey are
 * persisted as the orchestrator promises.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runInstallBootstrap } from '../src/auth/install-bootstrap'
import { startLoopback } from '../src/auth/loopback-server'

interface PendingHandoff {
  redirectUri: string
}

interface ServerHandle {
  url: string
  stop(): void
  handoffs: Map<string, PendingHandoff>
  mintedKeys: string[]
}

function startFakeOrchentraServer(): ServerHandle {
  const handoffs = new Map<string, PendingHandoff>()
  const mintedKeys: string[] = []

  const server = Bun.serve({
    port: 0,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url)
      if (req.method === 'POST' && url.pathname === '/api/install-handoff/start') {
        const body = (await req.json()) as { state?: string; redirectUri?: string }
        if (!body.state || !body.redirectUri) {
          return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 })
        }
        if (handoffs.has(body.state)) {
          return new Response(JSON.stringify({ error: 'state_in_use' }), { status: 409 })
        }
        handoffs.set(body.state, { redirectUri: body.redirectUri })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (req.method === 'GET' && url.pathname === '/auth/github/app/callback') {
        const state = url.searchParams.get('state') ?? ''
        const installationIdStr = url.searchParams.get('installation_id') ?? ''
        const entry = handoffs.get(state)
        if (!entry) {
          return new Response(null, {
            status: 302,
            headers: { location: 'http://localhost:3000/dashboard/integrations?error=invalid_state' },
          })
        }
        const apiKey = 'e2e-plaintext-key'
        mintedKeys.push(apiKey)
        const redirect = new URL(entry.redirectUri)
        redirect.searchParams.set('orgId', 'Athrean')
        redirect.searchParams.set('installationId', installationIdStr)
        redirect.searchParams.set('apiKey', apiKey)
        return new Response(null, { status: 302, headers: { location: redirect.toString() } })
      }
      return new Response('not found', { status: 404 })
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
    handoffs,
    mintedKeys,
  }
}

let serverHandle: ServerHandle
let cwd: string

beforeEach(() => {
  serverHandle = startFakeOrchentraServer()
  cwd = mkdtempSync(join(tmpdir(), 'orchentra-e2e-fresh-'))
})

afterEach(() => {
  serverHandle?.stop()
  if (cwd && existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
})

describe('end-to-end fresh install', () => {
  test('orchestrator → real HTTP → real loopback → settings.json + apiKey persisted', async () => {
    const browserUrls: string[] = []
    const writtenApiKeys: string[] = []

    const pendingBrowserRequests: Promise<unknown>[] = []
    const fakeBrowser = async (url: string): Promise<void> => {
      browserUrls.push(url)
      const parsed = new URL(url)
      const state = parsed.searchParams.get('state')
      if (!state) throw new Error('no state in install URL')
      // Simulate the browser following the install completion → callback.
      // `fetch` follows the 302 by default, which lands on the loopback.
      // Track + .catch so the inevitable ECONNRESET when the server stops
      // does not surface as an unhandled rejection.
      const p = fetch(`${serverHandle.url}/auth/github/app/callback?installation_id=8675309&state=${state}`).catch(
        () => undefined,
      )
      pendingBrowserRequests.push(p)
    }

    const result = await runInstallBootstrap({
      serverUrl: serverHandle.url,
      owner: 'Athrean',
      appSlug: 'orchentra',
      cwd,
      timeoutMs: 5_000,
      randomState: () => 'e2e-state-nonce-' + 'x'.repeat(32),
      openBrowser: fakeBrowser,
      makeLoopback: (o) => startLoopback({ timeoutMs: o.timeoutMs }),
      fetch,
      writeSettings: (input) => {
        const dir = join(input.cwd, '.orchentra')
        mkdirSync(dir, { recursive: true })
        const path = join(dir, 'settings.json')
        writeFileSync(path, JSON.stringify({ orgId: input.orgId, serverUrl: input.serverUrl }, null, 2))
        return path
      },
      saveApiKey: (apiKey: string) => {
        writtenApiKeys.push(apiKey)
        return join(cwd, '.orchentra', 'fake-keychain')
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.orgId).toBe('Athrean')
    expect(result.installationId).toBe(8675309)

    expect(browserUrls.length).toBe(1)
    expect(browserUrls[0]).toContain('/installations/new?state=')

    expect(writtenApiKeys).toEqual(['e2e-plaintext-key'])
    expect(serverHandle.mintedKeys).toEqual(['e2e-plaintext-key'])

    const settingsPath = join(cwd, '.orchentra', 'settings.json')
    expect(existsSync(settingsPath)).toBe(true)
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(parsed.orgId).toBe('Athrean')
    expect(parsed.serverUrl).toBe(serverHandle.url)

    // Drain the simulated browser request so afterEach can stop the server
    // without a socket close racing with an outstanding fetch.
    await Promise.all(pendingBrowserRequests)
  })
})
