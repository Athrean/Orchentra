/**
 * Slice 2 end-to-end (#376): bootstrap orchestrator detects an existing GH
 * App installation via /api/installations/by-owner/:owner and opens the
 * configure URL (`/installations/<id>?state=...`) instead of install/new.
 * The server callback rotates the apiKey on the existing installation row.
 *
 * Mirrors the structure of bootstrap-e2e-fresh.test.ts but pre-seeds the
 * fake Orchentra server with a prior installation record.
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

interface ExistingInstallSeed {
  orgId: string
  installationId: number
  installedAt: Date
  suspendedAt: Date | null
}

interface ServerHandle {
  url: string
  stop(): void
  handoffs: Map<string, PendingHandoff>
  mintedKeys: string[]
  installs: Map<string, ExistingInstallSeed>
  callbackCalls: { state: string; installationId: number }[]
}

function startFakeOrchentraServer(seeded: ExistingInstallSeed | null): ServerHandle {
  const handoffs = new Map<string, PendingHandoff>()
  const mintedKeys: string[] = []
  const callbackCalls: { state: string; installationId: number }[] = []
  const installs = new Map<string, ExistingInstallSeed>()
  if (seeded) installs.set(seeded.orgId.toLowerCase(), seeded)

  const server = Bun.serve({
    port: 0,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url)
      if (req.method === 'GET' && url.pathname.startsWith('/api/installations/by-owner/')) {
        const owner = url.pathname.slice('/api/installations/by-owner/'.length)
        const seed = installs.get(owner.toLowerCase())
        if (!seed) {
          return new Response(JSON.stringify({ error: 'not_installed' }), { status: 404 })
        }
        return new Response(
          JSON.stringify({
            orgId: seed.orgId,
            installationId: seed.installationId,
            installedAt: seed.installedAt.toISOString(),
            suspendedAt: seed.suspendedAt ? seed.suspendedAt.toISOString() : null,
          }),
          { status: 200 },
        )
      }
      if (req.method === 'POST' && url.pathname === '/api/install-handoff/start') {
        const body = (await req.json()) as { state?: string; redirectUri?: string }
        if (!body.state || !body.redirectUri) return new Response('bad', { status: 400 })
        if (handoffs.has(body.state)) return new Response('dup', { status: 409 })
        handoffs.set(body.state, { redirectUri: body.redirectUri })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (req.method === 'GET' && url.pathname === '/auth/github/app/callback') {
        const state = url.searchParams.get('state') ?? ''
        const installationId = Number(url.searchParams.get('installation_id') ?? '0')
        const entry = handoffs.get(state)
        if (!entry) {
          return new Response(null, {
            status: 302,
            headers: { location: 'http://localhost:3000/dashboard/integrations?error=invalid_state' },
          })
        }
        callbackCalls.push({ state, installationId })
        const apiKey = `rotated-key-${mintedKeys.length + 1}`
        mintedKeys.push(apiKey)
        const redirect = new URL(entry.redirectUri)
        redirect.searchParams.set('orgId', seeded?.orgId ?? 'Athrean')
        redirect.searchParams.set('installationId', String(installationId))
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
    installs,
    callbackCalls,
  }
}

let serverHandle: ServerHandle
let cwd: string

beforeEach(() => {
  serverHandle = startFakeOrchentraServer({
    orgId: 'Athrean',
    installationId: 77777,
    installedAt: new Date('2026-05-01T00:00:00Z'),
    suspendedAt: null,
  })
  cwd = mkdtempSync(join(tmpdir(), 'orchentra-e2e-installed-'))
})

afterEach(() => {
  serverHandle?.stop()
  if (cwd && existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
})

describe('end-to-end already-installed', () => {
  test('orchestrator → by-owner probe → configure URL → rotated apiKey persisted', async () => {
    const browserUrls: string[] = []
    const writtenApiKeys: string[] = []
    const pending: Promise<unknown>[] = []

    const fakeBrowser = async (url: string): Promise<void> => {
      browserUrls.push(url)
      const parsed = new URL(url)
      const state = parsed.searchParams.get('state')
      const installationId = parsed.pathname.split('/').pop()
      if (!state) throw new Error('no state')
      pending.push(
        fetch(`${serverHandle.url}/auth/github/app/callback?installation_id=${installationId}&state=${state}`).catch(
          () => undefined,
        ),
      )
    }

    const result = await runInstallBootstrap({
      serverUrl: serverHandle.url,
      owner: 'Athrean',
      appSlug: 'orchentra',
      cwd,
      timeoutMs: 5_000,
      randomState: () => 'installed-state-' + 'y'.repeat(32),
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
    expect(result.installationId).toBe(77777)
    expect(result.orgId).toBe('Athrean')

    expect(browserUrls.length).toBe(1)
    expect(browserUrls[0]).toContain('/installations/77777?state=')
    expect(browserUrls[0]).not.toContain('/installations/new')

    expect(writtenApiKeys).toEqual(['rotated-key-1'])
    expect(serverHandle.callbackCalls).toEqual([{ state: 'installed-state-' + 'y'.repeat(32), installationId: 77777 }])

    const parsed = JSON.parse(readFileSync(join(cwd, '.orchentra', 'settings.json'), 'utf8'))
    expect(parsed.orgId).toBe('Athrean')

    await Promise.all(pending)
  })
})
