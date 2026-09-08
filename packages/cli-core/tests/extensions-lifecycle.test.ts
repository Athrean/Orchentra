import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExtensionStore } from '../src/extensions/store'

let root: string
let source: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orchentra-ext-store-'))
  source = mkdtempSync(join(tmpdir(), 'orchentra-ext-src-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(source, { recursive: true, force: true })
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
      mcp: { local: { transport: 'stdio', command: 'echo', args: ['${PLUGIN_ROOT}/server.js'] } },
      hooks: { PreToolUse: ['echo pre'] },
      ...overrides,
    }),
  )
  write('skills/greet/SKILL.md', '---\nname: greet\ndescription: Greet someone\n---\nSay hello.\n')
  write('commands/hello.md', '---\ndescription: Say hello\n---\nHello.\n')
  write('agents/scout.md', '---\nname: scout\ndescription: Look around\ntools: read-only\n---\nScout the repo.\n')
}

const store = (): ExtensionStore => new ExtensionStore(root)

describe('extension lifecycle', () => {
  test('installs, updates, rolls back, disables and removes a plugin', async () => {
    writePlugin()
    const installed = await store().install('plugin', source)
    expect(installed.name).toBe('demo')
    expect(installed.version).toBe('1.0.0')
    expect(installed.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(installed.enabled).toBe(true)
    expect(installed.previousDigest).toBeUndefined()

    expect(store().install('plugin', source)).rejects.toThrow(/already installed/)

    writePlugin({ version: '1.1.0' })
    const updated = await store().update('plugin', 'demo')
    expect(updated.version).toBe('1.1.0')
    expect(updated.previousDigest).toBe(installed.digest)
    expect(updated.digest).not.toBe(installed.digest)

    await store().change('plugin', 'demo', 'rollback')
    const rolledBack = (await store().list('plugin'))[0]!
    expect(rolledBack.version).toBe('1.0.0')
    expect(rolledBack.digest).toBe(installed.digest)
    expect(rolledBack.previousDigest).toBe(updated.digest)

    await store().change('plugin', 'demo', 'disable')
    expect((await store().list('plugin'))[0]!.enabled).toBe(false)
    await store().change('plugin', 'demo', 'enable')
    expect((await store().list('plugin'))[0]!.enabled).toBe(true)

    await store().change('plugin', 'demo', 'remove')
    expect(await store().list()).toEqual([])
  })

  test('rollback without a previous installation fails', async () => {
    writePlugin()
    await store().install('plugin', source)
    expect(store().change('plugin', 'demo', 'rollback')).rejects.toThrow(/no previous installation/)
  })

  test('update cannot rename an installed plugin', async () => {
    writePlugin()
    await store().install('plugin', source)
    writePlugin({ name: 'other' })
    expect(store().update('plugin', 'demo')).rejects.toThrow(/cannot rename/)
  })

  test('installs a single skill directory and rejects a collection', async () => {
    write('SKILL.md', '---\nname: lone\ndescription: A lone skill\n---\nBody.\n')
    const entry = await store().install('skill', source)
    expect(entry.kind).toBe('skill')
    expect(entry.name).toBe('lone')

    const collection = mkdtempSync(join(tmpdir(), 'orchentra-ext-collection-'))
    try {
      for (const name of ['one', 'two']) {
        mkdirSync(join(collection, name), { recursive: true })
        writeFileSync(
          join(collection, name, 'SKILL.md'),
          `---\nname: ${name}\ndescription: Skill ${name}\n---\nBody.\n`,
        )
      }
      expect(store().install('skill', collection)).rejects.toThrow(/one valid SKILL\.md/)
    } finally {
      rmSync(collection, { recursive: true, force: true })
    }
  })
})

describe('extension validation', () => {
  test('rejects a manifest path that escapes the installation', async () => {
    writePlugin({ skills: ['../outside'] })
    expect(store().install('plugin', source)).rejects.toThrow(/escapes the installation|Extension path/)
  })

  test('rejects an absolute manifest path', async () => {
    writePlugin({ commands: ['/etc'] })
    expect(store().install('plugin', source)).rejects.toThrow(/must be relative/)
  })

  test('rejects an unsupported schema version', async () => {
    writePlugin({ schemaVersion: 2 })
    expect(store().install('plugin', source)).rejects.toThrow(/schemaVersion/)
  })

  test('rejects a command whose name collides with a bundled skill', async () => {
    writePlugin()
    write('commands/greet.md', '---\ndescription: Collides with the skill\n---\nHi.\n')
    expect(store().install('plugin', source)).rejects.toThrow(/Duplicate skill\/command name/)
  })

  test('rejects an MCP server without a usable transport', async () => {
    writePlugin({ mcp: { local: { command: 'echo' } } })
    expect(store().install('plugin', source)).rejects.toThrow(/transport stdio or http/)
  })

  test('rejects a symbolic link in the source tree', async () => {
    writePlugin()
    symlinkSync('/etc/passwd', join(source, 'skills', 'link'))
    expect(store().install('plugin', source)).rejects.toThrow(/symbolic links/)
  })

  test('rejects a Git source that is not pinned to a commit', async () => {
    expect(store().install('plugin', 'https://example.com/repo.git#main')).rejects.toThrow(/immutable commit/)
    expect(store().install('plugin', 'https://user:pw@example.com/repo.git#' + 'a'.repeat(40))).rejects.toThrow(
      /must not embed credentials/,
    )
  })
})
