import { describe, expect, test } from 'bun:test'
import { assignRefs, renderTree } from '../src/a11y'
import type { RawA11yNode } from '../src/engine'

const loginTree: RawA11yNode = {
  role: 'RootWebArea',
  name: 'Sign in',
  children: [
    { role: 'heading', name: 'Sign in' },
    { role: 'textbox', name: 'Username' },
    { role: 'textbox', name: 'Password' },
    { role: 'button', name: 'Log in' },
  ],
}

describe('assignRefs', () => {
  test('surfaces the root children as the tree with a ref per node', () => {
    const { tree, registry } = assignRefs(loginTree)
    expect(tree).toHaveLength(4)
    for (const node of tree) expect(node.ref).toMatch(/^e[0-9a-z]+$/)
    // every surfaced ref resolves to a locator descriptor
    for (const node of tree) expect(registry.get(node.ref)).toBeDefined()
  })

  test('refs are stable across identical snapshots', () => {
    const first = assignRefs(loginTree)
    const second = assignRefs(loginTree)
    expect(first.tree.map((n) => n.ref)).toEqual(second.tree.map((n) => n.ref))
  })

  test('duplicate role+name get distinct refs via nth', () => {
    const dup: RawA11yNode = {
      role: 'RootWebArea',
      children: [
        { role: 'button', name: 'Delete' },
        { role: 'button', name: 'Delete' },
      ],
    }
    const { tree, registry } = assignRefs(dup)
    expect(tree[0]!.ref).not.toBe(tree[1]!.ref)
    expect(registry.get(tree[0]!.ref)!.nth).toBe(0)
    expect(registry.get(tree[1]!.ref)!.nth).toBe(1)
  })

  test('descriptor carries role + name for engine relocation', () => {
    const { tree, registry } = assignRefs(loginTree)
    const button = tree.find((n) => n.role === 'button')!
    expect(registry.get(button.ref)).toEqual({ role: 'button', name: 'Log in', nth: 0 })
  })

  test('empty snapshot yields an empty tree', () => {
    expect(assignRefs(null)).toEqual({ tree: [], registry: new Map() })
  })
})

describe('renderTree', () => {
  test('renders refs and roles, never raw DOM', () => {
    const { tree } = assignRefs(loginTree)
    const text = renderTree(tree)
    expect(text).toContain('textbox "Username"')
    expect(text).toContain('button "Log in"')
    expect(text).toMatch(/\[e[0-9a-z]+\]/)
  })
})
