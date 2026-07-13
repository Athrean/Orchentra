import { describe, expect, test } from 'bun:test'
import { isBrowserOpError, type A11yNode } from '@orchentra/cli-core'
import { BrowserSessionManager } from '../src/session-manager'
import { createFakeLoginEngine } from '../src/testing/fake-engine'
import type { BrowserEngine } from '../src/engine'

function findRef(nodes: A11yNode[], role: string, name: string): string {
  const node = nodes.find((n) => n.role === role && n.name === name)
  if (!node) throw new Error(`no ref for ${role} "${name}"`)
  return node.ref
}

const CWD = '/tmp/otr-browser-waits'

describe('deterministic executor waits', () => {
  test('a navigate that never settles surfaces a classified wait-timeout', async () => {
    const { engine, controls } = createFakeLoginEngine()
    const mgr = new BrowserSessionManager({ cwd: CWD, loadEngine: async (): Promise<BrowserEngine> => engine })
    controls.hangNextWait()
    let caught: unknown
    try {
      await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })
    } catch (err) {
      caught = err
    }
    expect(isBrowserOpError(caught)).toBe(true)
    if (isBrowserOpError(caught)) expect(caught.kind).toBe('wait-timeout')
  })

  test('an action whose page never settles surfaces a classified wait-timeout', async () => {
    const { engine, controls } = createFakeLoginEngine()
    const mgr = new BrowserSessionManager({ cwd: CWD, loadEngine: async (): Promise<BrowserEngine> => engine })
    await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })
    const s = await mgr.snapshot()
    const userRef = findRef(s.tree, 'textbox', 'Username')

    controls.hangNextWait()
    let caught: unknown
    try {
      await mgr.act({ ref: userRef, action: 'type', text: 'admin' })
    } catch (err) {
      caught = err
    }
    expect(isBrowserOpError(caught)).toBe(true)
    if (isBrowserOpError(caught)) expect(caught.kind).toBe('wait-timeout')
  })

  test('snapshot still returns even if the page is slow to settle (best-effort wait)', async () => {
    const { engine, controls } = createFakeLoginEngine()
    const mgr = new BrowserSessionManager({ cwd: CWD, loadEngine: async (): Promise<BrowserEngine> => engine })
    await mgr.navigate({ url: 'http://127.0.0.1:5173/login' })
    controls.hangNextWait()
    const s = await mgr.snapshot()
    expect(s.tree.length).toBeGreaterThan(0)
  })
})
