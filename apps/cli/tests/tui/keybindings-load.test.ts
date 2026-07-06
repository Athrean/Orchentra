import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadUserBindings } from '../../src/tui/keybindings/load-user-bindings'

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
})
