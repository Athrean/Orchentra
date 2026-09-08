import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExtensionStore } from '@orchentra/cli-core'
import { loadExtensionCatalog } from '../src/extensions/catalog'

let storeRoot: string
let source: string
let workspace: string
let home: string
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  storeRoot = mkdtempSync(join(tmpdir(), 'orchentra-catalog-store-'))
  source = mkdtempSync(join(tmpdir(), 'orchentra-catalog-src-'))
  workspace = mkdtempSync(join(tmpdir(), 'orchentra-catalog-ws-'))
  // Keep the native skill scan off the developer's real home and index file.
  home = mkdtempSync(join(tmpdir(), 'orchentra-catalog-home-'))
  for (const key of ['HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']) saved[key] = process.env[key]
  process.env.HOME = home
  process.env.XDG_CACHE_HOME = join(home, 'cache')
  process.env.XDG_CONFIG_HOME = join(home, 'config')
})

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const dir of [storeRoot, source, workspace, home]) rmSync(dir, { recursive: true, force: true })
})

function write(path: string, content: string): void {
  mkdirSync(join(source, path, '..'), { recursive: true })
  writeFileSync(join(source, path), content)
}

function writePlugin(overrides: Record<string, unknown> = {}): void {
  write(
    'orchentra.plugin.json',
    JSON.stringify({
      schemaVersion: 1,
      name: 'demo',
      version: '1.0.0',
      description: 'Demo plugin',
      skills: ['skills'],
      commands: ['commands'],
      agents: ['agents'],
      mcp: { local: { transport: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/server.js'] } },
      hooks: { PreToolUse: ['echo pre'], PostToolUseFailure: ['echo failed'] },
      ...overrides,
    }),
  )
  write('skills/greet/SKILL.md', '---\nname: greet\ndescription: Greet someone\n---\nSay hello.\n')
  write('commands/hello.md', '---\ndescription: Say hello\n---\nHello.\n')
  write('agents/scout.md', '---\nname: scout\ndescription: Look around\ntools: read-only\n---\nScout the repo.\n')
}

describe('extension catalog', () => {
  test('exposes namespaced plugin contributions', async () => {
    writePlugin()
    const store = new ExtensionStore(storeRoot)
    const entry = await store.install('plugin', source)

    const catalog = await loadExtensionCatalog(workspace, store)
    expect(catalog.errors.filter((e) => e.message.startsWith('demo:'))).toEqual([])
    expect(catalog.skills.map((s) => s.name)).toContain('demo:greet')
    expect(catalog.skills.map((s) => s.name)).toContain('demo:hello')
    expect(Object.keys(catalog.agents)).toEqual(['demo:scout'])

    const server = catalog.servers['plugin-demo-local'] as { args: string[] }
    expect(server.args[0]).toBe(join(store.snapshot(entry), 'server.js'))

    expect(catalog.hooks.map((h) => ({ event: h.event, when: h.when }))).toEqual([
      { event: 'pre_tool_use', when: undefined },
      { event: 'post_tool_use', when: 'failure' },
    ])
    expect(catalog.hooks[0]!.command).toBe(`cd '${store.snapshot(entry)}' && echo pre`)
  })

  test('a workspace skill wins over an installed skill of the same name', async () => {
    write('SKILL.md', '---\nname: greet\ndescription: Installed greet\n---\nInstalled.\n')
    const store = new ExtensionStore(storeRoot)
    await store.install('skill', source)
    mkdirSync(join(workspace, '.orchentra', 'skills', 'greet'), { recursive: true })
    writeFileSync(
      join(workspace, '.orchentra', 'skills', 'greet', 'SKILL.md'),
      '---\nname: greet\ndescription: Workspace greet\n---\nWorkspace.\n',
    )

    const catalog = await loadExtensionCatalog(workspace, store)
    expect(catalog.skills.filter((s) => s.name === 'greet')).toHaveLength(1)
    expect(catalog.skills.find((s) => s.name === 'greet')!.description).toBe('Workspace greet')
  })

  test('skips a disabled extension', async () => {
    writePlugin()
    const store = new ExtensionStore(storeRoot)
    await store.install('plugin', source)
    await store.change('plugin', 'demo', 'disable')

    const catalog = await loadExtensionCatalog(workspace, store)
    expect(catalog.skills.map((s) => s.name)).not.toContain('demo:greet')
    expect(Object.keys(catalog.agents)).toEqual([])
  })

  test('reports a snapshot that broke after installation instead of throwing', async () => {
    writePlugin()
    const store = new ExtensionStore(storeRoot)
    const entry = await store.install('plugin', source)
    writeFileSync(join(store.snapshot(entry), 'orchentra.plugin.json'), '{ not json')

    const catalog = await loadExtensionCatalog(workspace, store)
    expect(catalog.errors.some((e) => e.message.startsWith('demo:'))).toBe(true)
    expect(catalog.skills.map((s) => s.name)).not.toContain('demo:greet')
  })
})
