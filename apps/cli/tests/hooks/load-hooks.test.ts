import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadHooks } from '../../src/hooks/load-hooks'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orchentra-hooks-load-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

function writeHooksFile(contents: string): void {
  mkdirSync(join(tempDir, '.orchentra'), { recursive: true })
  writeFileSync(join(tempDir, '.orchentra', 'hooks.json'), contents)
}

describe('loadHooks', () => {
  test('returns empty config when hooks.json is missing', () => {
    const cfg = loadHooks(tempDir)
    expect(cfg.version).toBe(1)
    expect(cfg.hooks).toEqual([])
  })

  test('parses a valid config with multiple hooks', () => {
    writeHooksFile(
      JSON.stringify({
        version: 1,
        hooks: [
          { event: 'pre_tool_use', tools: ['Bash'], command: './audit.sh' },
          { event: 'post_tool_use', tools: ['*'], command: './log.sh' },
        ],
      }),
    )
    const cfg = loadHooks(tempDir)
    expect(cfg.version).toBe(1)
    expect(cfg.hooks.length).toBe(2)
    expect(cfg.hooks[0]).toEqual({ event: 'pre_tool_use', tools: ['Bash'], command: './audit.sh' })
    expect(cfg.hooks[1]).toEqual({ event: 'post_tool_use', tools: ['*'], command: './log.sh' })
  })

  test('returns empty config when JSON is malformed', () => {
    writeHooksFile('not json {')
    const cfg = loadHooks(tempDir)
    expect(cfg.version).toBe(1)
    expect(cfg.hooks).toEqual([])
  })

  test('returns empty config when schema is invalid (missing event)', () => {
    writeHooksFile(
      JSON.stringify({
        version: 1,
        hooks: [{ tools: ['Bash'], command: './x.sh' }],
      }),
    )
    const cfg = loadHooks(tempDir)
    expect(cfg.hooks).toEqual([])
  })

  test('returns empty config when schema is invalid (wrong event value)', () => {
    writeHooksFile(
      JSON.stringify({
        version: 1,
        hooks: [{ event: 'on_tool_use', tools: ['Bash'], command: './x.sh' }],
      }),
    )
    const cfg = loadHooks(tempDir)
    expect(cfg.hooks).toEqual([])
  })

  test('returns empty config when tools is not an array', () => {
    writeHooksFile(
      JSON.stringify({
        version: 1,
        hooks: [{ event: 'pre_tool_use', tools: 'Bash', command: './x.sh' }],
      }),
    )
    const cfg = loadHooks(tempDir)
    expect(cfg.hooks).toEqual([])
  })

  test('returns empty config when version is unsupported', () => {
    writeHooksFile(
      JSON.stringify({
        version: 99,
        hooks: [],
      }),
    )
    const cfg = loadHooks(tempDir)
    expect(cfg.hooks).toEqual([])
  })

  test('accepts an empty hooks array', () => {
    writeHooksFile(JSON.stringify({ version: 1, hooks: [] }))
    const cfg = loadHooks(tempDir)
    expect(cfg.version).toBe(1)
    expect(cfg.hooks).toEqual([])
  })
})
