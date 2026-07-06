import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findDuplicateKeys, loadUserBindings } from '../../src/tui/keybindings/load-user-bindings'

describe('loadUserBindings', () => {
  let home: string
  let prev: string | undefined
  beforeEach(() => {
    prev = process.env['ORCHENTRA_CONFIG_HOME']
    home = mkdtempSync(join(tmpdir(), 'orchentra-kb-'))
    process.env['ORCHENTRA_CONFIG_HOME'] = home
  })
  afterEach(() => {
    if (prev === undefined) delete process.env['ORCHENTRA_CONFIG_HOME']
    else process.env['ORCHENTRA_CONFIG_HOME'] = prev
    rmSync(home, { recursive: true, force: true })
  })

  const write = (body: string): void => {
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'keybindings.json'), body)
  }

  test('no file yields no overrides', () => {
    expect(loadUserBindings()).toEqual({ overrides: {}, warnings: [] })
  })

  test('reads the bindings map', () => {
    write(JSON.stringify({ bindings: { 'history-search': 'ctrl+t', 'command-palette': 'ctrl+p' } }))
    const { overrides, warnings } = loadUserBindings()
    expect(overrides).toEqual({ 'history-search': 'ctrl+t', 'command-palette': 'ctrl+p' })
    expect(warnings).toEqual([])
  })

  test('malformed json degrades to no overrides with a warning', () => {
    write('{not json')
    const { overrides, warnings } = loadUserBindings()
    expect(overrides).toEqual({})
    expect(warnings.length).toBe(1)
  })

  test('non-object bindings is rejected', () => {
    write(JSON.stringify({ bindings: 'nope' }))
    expect(loadUserBindings().warnings.length).toBe(1)
  })

  test('non-string combo values are skipped with a warning', () => {
    write(JSON.stringify({ bindings: { 'history-search': 42 } }))
    const { overrides, warnings } = loadUserBindings()
    expect(overrides).toEqual({})
    expect(warnings.length).toBe(1)
  })

  test('duplicate action key warns instead of silently dropping one binding', () => {
    // Raw JSON with a repeated key — JSON.parse keeps only the last value.
    write('{ "bindings": { "history-search": "ctrl+t", "history-search": "ctrl+y" } }')
    const { overrides, warnings } = loadUserBindings()
    expect(overrides['history-search']).toBe('ctrl+y') // last value wins, as JSON does
    expect(warnings.some((w) => w.includes('history-search'))).toBe(true)
  })

  test('a well-formed file with no duplicates warns nothing', () => {
    write(JSON.stringify({ bindings: { 'history-search': 'ctrl+t', 'command-palette': 'ctrl+p' } }))
    expect(loadUserBindings().warnings).toEqual([])
  })
})

describe('findDuplicateKeys', () => {
  test('flags a key repeated in the same object', () => {
    expect(findDuplicateKeys('{ "a": 1, "a": 2 }')).toEqual(['a'])
  })

  test('reports each duplicated key once', () => {
    expect(findDuplicateKeys('{ "a": 1, "a": 2, "a": 3 }')).toEqual(['a'])
  })

  test('no duplicates yields an empty list', () => {
    expect(findDuplicateKeys('{ "a": 1, "b": 2 }')).toEqual([])
  })

  test('same key name in different objects is not a duplicate', () => {
    expect(findDuplicateKeys('{ "outer": { "a": 1 }, "a": 2 }')).toEqual([])
  })

  test('ignores duplicate-looking string values and colons inside strings', () => {
    expect(findDuplicateKeys('{ "a": "b: c, b: c", "d": "a" }')).toEqual([])
  })

  test('handles escaped quotes in keys and values', () => {
    expect(findDuplicateKeys('{ "a\\"x": 1, "a\\"x": 2 }')).toEqual(['a"x'])
  })

  test('does not treat array elements as keys', () => {
    expect(findDuplicateKeys('{ "a": ["x", "x", "x"] }')).toEqual([])
  })
})
