import { describe, expect, test } from 'bun:test'
import {
  browserActTool,
  browserCloseTool,
  browserNavigateTool,
  browserScreenshotTool,
  browserSnapshotTool,
} from '../src/tools/browser-tools'
import { DefaultToolRegistry } from '../src/tool-registry'
import {
  InMemoryTaskStore,
  ProcessSupervisor,
  browserOpError,
  type BrowserActParams,
  type BrowserActResult,
  type BrowserDiagnostics,
  type BrowserNavigateParams,
  type BrowserNavigateResult,
  type BrowserRunSession,
  type BrowserScreenshotParams,
  type BrowserScreenshotResult,
  type BrowserSnapshot,
  type SharedToolState,
  type SupervisedHandle,
  type ToolContext,
} from '@orchentra/cli-core'

class FakeSession implements BrowserRunSession {
  navigated: string[] = []
  shutdownCount = 0
  closeCount = 0
  actError?: unknown
  diag: BrowserDiagnostics = { consoleErrors: [], failedRequests: [] }

  async navigate(params: BrowserNavigateParams): Promise<BrowserNavigateResult> {
    this.navigated.push(params.url)
    return { url: params.url, title: 'Sign in', status: 200 }
  }
  async snapshot(): Promise<BrowserSnapshot> {
    return {
      url: 'http://127.0.0.1:5173/login',
      title: 'Sign in',
      tree: [
        { ref: 'e1', role: 'textbox', name: 'Username' },
        { ref: 'e2', role: 'button', name: 'Log in' },
      ],
      newConsoleErrors: this.diag.consoleErrors,
      newFailedRequests: this.diag.failedRequests,
    }
  }
  async act(params: BrowserActParams): Promise<BrowserActResult> {
    if (this.actError) throw this.actError
    return { action: params.action, ref: params.ref, remapped: false }
  }
  async screenshot(params: BrowserScreenshotParams): Promise<BrowserScreenshotResult> {
    return { path: params.path ?? '/tmp/shot.png', bytes: 2048 }
  }
  async close(): Promise<void> {
    this.closeCount++
  }
  async shutdown(): Promise<void> {
    this.shutdownCount++
  }
  diagnostics(): BrowserDiagnostics {
    return this.diag
  }
}

function ctxWith(session: BrowserRunSession, supervisor?: ProcessSupervisor): ToolContext {
  const sharedState: SharedToolState = {
    taskStore: new InMemoryTaskStore(),
    todos: [],
    agentCounter: 0,
    planMode: false,
    browser: session,
    processSupervisor: supervisor,
  }
  return { sessionId: 's', cwd: '/tmp', permissionMode: 'danger-full-access', sharedState }
}

describe('browser ops registration', () => {
  test('all five ops are registered as builtin tools', () => {
    const registry = new DefaultToolRegistry()
    for (const name of ['browser_navigate', 'browser_snapshot', 'browser_act', 'browser_screenshot', 'browser_close']) {
      expect(registry.has(name)).toBe(true)
    }
  })
})

describe('browser_navigate', () => {
  test('navigates to a literal url', async () => {
    const session = new FakeSession()
    const res = await browserNavigateTool.execute({ url: 'http://127.0.0.1:5173/login' }, ctxWith(session))
    expect(res.isError).toBe(false)
    expect(res.content).toContain('navigated to http://127.0.0.1:5173/login')
    expect(session.navigated).toEqual(['http://127.0.0.1:5173/login'])
  })

  test('resolves the URL from a ProcessSupervisor background handle', async () => {
    const session = new FakeSession()
    const supervisor = new ProcessSupervisor({
      spawn: (): SupervisedHandle => ({
        pid: 1,
        exited: new Promise<number>(() => {}),
        kill: () => {},
        stdout: null,
        stderr: null,
      }),
      probe: async () => true,
      baseEnv: {},
    })
    const proc = supervisor.start({ command: 'dev', cwd: '/tmp', readiness: { url: 'http://127.0.0.1:4000/' } })
    const ready = await supervisor.waitUntilReady(proc.id, 1000)
    expect(ready.url).toBe('http://127.0.0.1:4000/')

    const res = await browserNavigateTool.execute({ backgroundProcessId: proc.id }, ctxWith(session, supervisor))
    expect(res.isError).toBe(false)
    expect(session.navigated).toEqual(['http://127.0.0.1:4000/'])
  })

  test('errors when neither url nor a resolvable handle is given', async () => {
    const res = await browserNavigateTool.execute({}, ctxWith(new FakeSession()))
    expect(res.isError).toBe(true)
    expect(res.content).toContain('requires url or backgroundProcessId')
  })

  test('errors without a browser session in context', async () => {
    const res = await browserNavigateTool.execute(
      { url: 'http://x' },
      { sessionId: 's', cwd: '/tmp', sharedState: undefined },
    )
    expect(res.isError).toBe(true)
    expect(res.content).toContain('not available')
  })
})

describe('browser_snapshot', () => {
  test('renders the a11y tree with refs and surfaces deltas', async () => {
    const session = new FakeSession()
    session.diag = {
      consoleErrors: [{ text: 'Invalid credentials', at: 'now' }],
      failedRequests: [{ url: '/api/login', method: 'POST', status: 401, at: 'now' }],
    }
    const res = await browserSnapshotTool.execute({}, ctxWith(session))
    expect(res.isError).toBe(false)
    expect(res.content).toContain('[e1] textbox "Username"')
    expect(res.content).toContain('[e2] button "Log in"')
    expect(res.content).toContain('console errors since last snapshot (1)')
    expect(res.content).toContain('failed requests since last snapshot (1)')
    expect(res.content).toContain('POST /api/login [401]')
  })
})

describe('browser_act', () => {
  test('reports the action', async () => {
    const res = await browserActTool.execute({ ref: 'e1', action: 'type', text: 'admin' }, ctxWith(new FakeSession()))
    expect(res.isError).toBe(false)
    expect(res.content).toBe('type on e1')
  })

  test('a failed op surfaces the classified kind plus diagnostics evidence', async () => {
    const session = new FakeSession()
    session.actError = browserOpError('ref-not-found', 'ref e9 is not in the current snapshot')
    session.diag = { consoleErrors: [{ text: 'boom', at: 'now' }], failedRequests: [] }
    const res = await browserActTool.execute({ ref: 'e9', action: 'click' }, ctxWith(session))
    expect(res.isError).toBe(true)
    expect(res.content).toContain('browser ref-not-found')
    const kinds = (res.evidence ?? []).map((e) => e.kind)
    expect(kinds).toContain('browser-failure')
    expect(kinds).toContain('browser-diagnostics')
  })
})

describe('browser_screenshot', () => {
  test('returns an artifact for the captured image', async () => {
    const res = await browserScreenshotTool.execute({ path: '/tmp/a.png' }, ctxWith(new FakeSession()))
    expect(res.isError).toBe(false)
    expect(res.artifacts).toEqual([{ uri: '/tmp/a.png', kind: 'file', action: 'created' }])
  })
})

describe('browser_close', () => {
  test('closes the session', async () => {
    const session = new FakeSession()
    const res = await browserCloseTool.execute({}, ctxWith(session))
    expect(res.isError).toBe(false)
    expect(session.closeCount).toBe(1)
  })

  test('is a no-op without a session', async () => {
    const res = await browserCloseTool.execute({}, { sessionId: 's', cwd: '/tmp', sharedState: undefined })
    expect(res.isError).toBe(false)
    expect(res.content).toContain('no browser session')
  })
})
