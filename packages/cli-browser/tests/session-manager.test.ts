import { describe, expect, test } from 'bun:test'
import { isBrowserOpError, type A11yNode } from '@orchentra/cli-core'
import { BrowserSessionManager } from '../src/session-manager'
import { createFakeLoginEngine } from '../src/testing/fake-engine'
import type { BrowserEngine } from '../src/engine'

function findRef(nodes: A11yNode[], role: string, name: string): string {
  for (const node of nodes) {
    if (node.role === role && node.name === name) return node.ref
    if (node.children) {
      const found = tryFind(node.children, role, name)
      if (found) return found
    }
  }
  throw new Error(`no ref for ${role} "${name}"`)
}

function tryFind(nodes: A11yNode[], role: string, name: string): string | undefined {
  for (const node of nodes) {
    if (node.role === role && node.name === name) return node.ref
    if (node.children) {
      const found = tryFind(node.children, role, name)
      if (found) return found
    }
  }
  return undefined
}

const CWD = '/tmp/otr-browser-test'

describe('BrowserSessionManager — scripted form-login (refs only)', () => {
  test('drives navigate → snapshot → act → snapshot to a logged-in state', async () => {
    const { engine } = createFakeLoginEngine()
    let loaded = 0
    const mgr = new BrowserSessionManager({
      cwd: CWD,
      loadEngine: async (): Promise<BrowserEngine> => {
        loaded++
        return engine
      },
    })
    // Constructing pulls no engine — the lazy path is untouched until first navigate.
    expect(loaded).toBe(0)

    const nav = await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })
    expect(loaded).toBe(1)
    expect(nav.url).toContain('/login')

    const before = await mgr.snapshot()
    const userRef = findRef(before.tree, 'textbox', 'Username')
    const passRef = findRef(before.tree, 'textbox', 'Password')
    const loginRef = findRef(before.tree, 'button', 'Log in')

    await mgr.act({ ref: userRef, action: 'type', text: 'admin' })
    await mgr.act({ ref: passRef, action: 'type', text: 'secret' })
    const submit = await mgr.act({ ref: loginRef, action: 'click' })
    expect(submit.remapped).toBe(false)

    const after = await mgr.snapshot()
    expect(after.tree.some((n) => n.role === 'heading' && n.name === 'Welcome, admin')).toBe(true)
    expect(after.newConsoleErrors).toHaveLength(0)
    expect(after.newFailedRequests).toHaveLength(0)

    await mgr.shutdown()
  })

  test('bad credentials surface console-error + failed-request deltas', async () => {
    const { engine } = createFakeLoginEngine()
    const mgr = new BrowserSessionManager({ cwd: CWD, loadEngine: async (): Promise<BrowserEngine> => engine })
    await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })

    const s = await mgr.snapshot()
    await mgr.act({ ref: findRef(s.tree, 'textbox', 'Username'), action: 'type', text: 'admin' })
    await mgr.act({ ref: findRef(s.tree, 'textbox', 'Password'), action: 'type', text: 'wrong' })
    await mgr.act({ ref: findRef(s.tree, 'button', 'Log in'), action: 'submit' })

    const after = await mgr.snapshot()
    expect(after.tree.some((n) => n.name === 'Welcome, admin')).toBe(false)
    expect(after.newConsoleErrors).toHaveLength(1)
    expect(after.newConsoleErrors[0]!.text).toContain('Invalid credentials')
    expect(after.newFailedRequests).toHaveLength(1)
    expect(after.newFailedRequests[0]!.status).toBe(401)

    // diagnostics carries the cumulative failure signals for a failing tool result.
    const diag = mgr.diagnostics()
    expect(diag.consoleErrors).toHaveLength(1)
    expect(diag.failedRequests).toHaveLength(1)
  })
})

describe('BrowserSessionManager — ref remap (R6)', () => {
  test('acting on a valid ref with no current snapshot re-observes once and succeeds', async () => {
    const { engine } = createFakeLoginEngine()
    const mgr = new BrowserSessionManager({ cwd: CWD, loadEngine: async (): Promise<BrowserEngine> => engine })
    await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })

    const s = await mgr.snapshot()
    const userRef = findRef(s.tree, 'textbox', 'Username')

    // Navigate again — refs go stale (registry cleared) but the element still exists.
    await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })
    const res = await mgr.act({ ref: userRef, action: 'type', text: 'admin' })
    expect(res.remapped).toBe(true)
  })

  test('a ref that does not exist even after remap surfaces as a tool error', async () => {
    const { engine } = createFakeLoginEngine()
    const mgr = new BrowserSessionManager({ cwd: CWD, loadEngine: async (): Promise<BrowserEngine> => engine })
    await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })
    await mgr.snapshot()

    let caught: unknown
    try {
      await mgr.act({ ref: 'e_does_not_exist', action: 'click' })
    } catch (err) {
      caught = err
    }
    expect(isBrowserOpError(caught)).toBe(true)
    if (isBrowserOpError(caught)) expect(caught.kind).toBe('ref-not-found')
  })
})

describe('BrowserSessionManager — crash recovery', () => {
  test('a mid-op crash restarts the session and completes the action (bounded)', async () => {
    const { engine, controls } = createFakeLoginEngine()
    const mgr = new BrowserSessionManager({
      cwd: CWD,
      loadEngine: async (): Promise<BrowserEngine> => engine,
      maxRestarts: 1,
    })
    await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })
    const s = await mgr.snapshot()
    const userRef = findRef(s.tree, 'textbox', 'Username')

    controls.crashNextAction()
    const res = await mgr.act({ ref: userRef, action: 'type', text: 'admin' })
    expect(res.remapped).toBe(true)
    // one initial page + one restart
    expect(controls.newPageCount()).toBe(2)

    await mgr.shutdown()
  })

  test('exhausting the restart budget surfaces a crash error', async () => {
    const { engine, controls } = createFakeLoginEngine()
    const mgr = new BrowserSessionManager({
      cwd: CWD,
      loadEngine: async (): Promise<BrowserEngine> => engine,
      maxRestarts: 0,
    })
    await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })
    const s = await mgr.snapshot()
    const userRef = findRef(s.tree, 'textbox', 'Username')

    controls.crashNextAction()
    let caught: unknown
    try {
      await mgr.act({ ref: userRef, action: 'type', text: 'admin' })
    } catch (err) {
      caught = err
    }
    expect(isBrowserOpError(caught)).toBe(true)
    if (isBrowserOpError(caught)) expect(caught.kind).toBe('crash')
  })
})
