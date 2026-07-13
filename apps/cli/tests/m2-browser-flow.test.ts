import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'node:net'
import {
  InMemoryTaskStore,
  ProcessSupervisor,
  type BrowserSnapshot,
  type ConsoleErrorEntry,
  type FailedRequestEntry,
  type SharedToolState,
  type ToolContext,
} from '@orchentra/cli-core'
import { BrowserSessionManager } from '@orchentra/cli-browser'
import type { BrowserEngine, EnginePage, GotoResult, RawA11yNode } from '@orchentra/cli-browser'
import { browserNavigateTool, browserSnapshotTool } from '@orchentra/cli-tools'

/**
 * M2 end-to-end at the orchestration level: a real ProcessSupervisor starts a
 * real dev server carrying a seeded bug (/api/status → 500), the browser tool
 * layer consumes the discovered URL and observes the failure through real HTTP,
 * the bug is "fixed", and a re-observation verifies success with clean
 * console/network evidence — then teardown leaves no leaked process.
 *
 * The engine here is a fetching stand-in (Chromium is not available in the unit
 * suite) but every other seam is real: supervisor, dev server, URL discovery,
 * HTTP round-trips reflecting the bug then the fix, the tools, the evidence, and
 * the teardown. The real-Chromium + real-provider autonomous run is the M3
 * browser-eval job.
 */

// A browser engine whose observation is a real fetch of the running server's
// status endpoint — so the a11y tree and the console/network evidence reflect
// the actual server response, not a script.
function fetchingEngine(): BrowserEngine {
  return {
    async newPage(): Promise<EnginePage> {
      return new FetchingPage()
    },
    async close(): Promise<void> {},
  }
}

class FetchingPage implements EnginePage {
  private pageUrl = 'about:blank'
  private readonly consoleErr: ConsoleErrorEntry[] = []
  private readonly failed: FailedRequestEntry[] = []

  async goto(url: string): Promise<GotoResult> {
    this.pageUrl = url
    return { url, status: 200, title: 'App' }
  }
  currentUrl(): string {
    return this.pageUrl
  }
  async title(): Promise<string> {
    return 'App'
  }
  async waitForStable(): Promise<void> {}

  async a11ySnapshot(): Promise<RawA11yNode | null> {
    const statusUrl = `${new URL(this.pageUrl).origin}/api/status`
    try {
      const res = await fetch(statusUrl)
      if (!res.ok) {
        const at = new Date().toISOString()
        this.failed.push({ url: statusUrl, method: 'GET', status: res.status, at })
        this.consoleErr.push({ text: `status check failed: ${res.status}`, at })
        return { role: 'RootWebArea', name: 'App', children: [{ role: 'heading', name: 'Status: broken' }] }
      }
      const body = (await res.json()) as { healthy?: boolean }
      const label = body.healthy ? 'Status: healthy' : 'Status: broken'
      return { role: 'RootWebArea', name: 'App', children: [{ role: 'heading', name: label }] }
    } catch (err) {
      this.consoleErr.push({ text: String(err), at: new Date().toISOString() })
      return { role: 'RootWebArea', name: 'App', children: [] }
    }
  }

  async click(): Promise<void> {}
  async fill(): Promise<void> {}
  async selectOption(): Promise<void> {}
  async submit(): Promise<void> {}
  async screenshot(): Promise<number> {
    return 64
  }
  consoleErrors(): ConsoleErrorEntry[] {
    return this.consoleErr
  }
  failedRequests(): FailedRequestEntry[] {
    return this.failed
  }
  isClosed(): boolean {
    return false
  }
  async close(): Promise<void> {}
}

function ctxFor(dir: string, supervisor: ProcessSupervisor, browser: BrowserSessionManager): ToolContext {
  const sharedState: SharedToolState = {
    taskStore: new InMemoryTaskStore(),
    todos: [],
    agentCounter: 0,
    planMode: false,
    processSupervisor: supervisor,
    browser,
  }
  return { sessionId: 'm2', cwd: dir, permissionMode: 'danger-full-access', sharedState }
}

function tcpOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const finish = (ok: boolean): void => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function waitForPortClosed(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await tcpOpen(host, port))) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

describe('M2 browser verification flow (supervisor + dev server + tools)', () => {
  let dir: string | undefined
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  test('seeded bug is observed, fixed, and verified with clean evidence — no leaked process', async () => {
    dir = await mkdtemp(join(tmpdir(), 'otr-m2-'))
    const script = join(dir, 'server.ts')
    await writeFile(
      script,
      [
        'let healthy = false',
        'const server = Bun.serve({',
        '  port: 0,',
        '  fetch(req) {',
        '    const url = new URL(req.url)',
        "    if (url.pathname === '/toggle') { healthy = true; return new Response('ok') }",
        "    if (url.pathname === '/api/status') {",
        '      return healthy',
        '        ? Response.json({ healthy: true })',
        "        : new Response(JSON.stringify({ error: 'boom' }), { status: 500 })",
        '    }',
        "    return new Response('<h1>App</h1>', { headers: { 'content-type': 'text/html' } })",
        '  },',
        '})',
        'console.log(`ready http://127.0.0.1:${server.port}/`)',
      ].join('\n'),
    )

    const supervisor = new ProcessSupervisor()
    const proc = supervisor.start({
      command: `bun ${script}`,
      cwd: dir,
      readiness: { urlFromLog: /http:\/\/\S+/ },
      label: 'fixture-dev-server',
    })
    const ready = await supervisor.waitUntilReady(proc.id, 15_000)
    expect(ready.status).toBe('ready')
    expect(ready.url).toContain('127.0.0.1')
    const baseUrl = ready.url!
    const port = ready.port!

    const browser = new BrowserSessionManager({
      cwd: dir,
      loadEngine: async (): Promise<BrowserEngine> => fetchingEngine(),
    })
    const ctx = ctxFor(dir, supervisor, browser)

    // Navigate by handle — browser_navigate consumes the supervisor's dev-server URL.
    const nav = await browserNavigateTool.execute({ backgroundProcessId: proc.id }, ctx)
    expect(nav.isError).toBe(false)

    // Observe the seeded bug: the a11y tree shows broken + a failed request delta.
    const broken = await browserSnapshotTool.execute({}, ctx)
    expect(broken.content).toContain('Status: broken')
    expect(broken.content).toContain('failed requests since last snapshot')
    const brokenData = broken.data as BrowserSnapshot
    expect(brokenData.newFailedRequests.some((r) => r.status === 500)).toBe(true)

    // The fix lands (server flips to healthy).
    await fetch(`${baseUrl}toggle`)

    // Re-observe: success in the a11y tree, and no new console/network failures.
    await browserNavigateTool.execute({ backgroundProcessId: proc.id }, ctx)
    const fixed = await browserSnapshotTool.execute({}, ctx)
    expect(fixed.content).toContain('Status: healthy')
    const fixedData = fixed.data as BrowserSnapshot
    expect(fixedData.newFailedRequests).toHaveLength(0)
    expect(fixedData.newConsoleErrors).toHaveLength(0)

    await browser.shutdown()
    await supervisor.shutdown()

    // No zombie: the dev-server port is released promptly after teardown.
    expect(await waitForPortClosed('127.0.0.1', port, 3000)).toBe(true)
  }, 20_000)
})
