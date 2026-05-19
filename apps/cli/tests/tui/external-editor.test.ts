import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { openInEditor } from '../../src/tui/external-editor'

const STUB_EDITOR = join(import.meta.dir, '..', 'fixtures', 'stub-editor.sh')

describe('openInEditor', () => {
  let prevEditor: string | undefined
  let prevVisual: string | undefined
  let prevStubContent: string | undefined
  let prevStubExit: string | undefined

  beforeEach(() => {
    prevEditor = process.env['EDITOR']
    prevVisual = process.env['VISUAL']
    prevStubContent = process.env['STUB_EDITOR_CONTENT']
    prevStubExit = process.env['STUB_EDITOR_EXIT']
    // Force stub editor for every test.
    process.env['EDITOR'] = STUB_EDITOR
    delete process.env['VISUAL']
    delete process.env['STUB_EDITOR_CONTENT']
    delete process.env['STUB_EDITOR_EXIT']
  })
  afterEach(() => {
    restoreEnv('EDITOR', prevEditor)
    restoreEnv('VISUAL', prevVisual)
    restoreEnv('STUB_EDITOR_CONTENT', prevStubContent)
    restoreEnv('STUB_EDITOR_EXIT', prevStubExit)
  })

  test('returns edited content after stub editor overwrites the tmpfile', async () => {
    process.env['STUB_EDITOR_CONTENT'] = 'edited body\nwith newlines'
    const result = await openInEditor('initial buffer')
    expect(result).toBe('edited body\nwith newlines')
  })

  test('returns the initial content unchanged when the stub editor exits 0 without writing', async () => {
    const result = await openInEditor('untouched')
    expect(result).toBe('untouched')
  })

  test('returns null when the editor exits non-zero', async () => {
    process.env['STUB_EDITOR_EXIT'] = '7'
    process.env['STUB_EDITOR_CONTENT'] = 'would-have-been-saved'
    const result = await openInEditor('initial')
    expect(result).toBeNull()
  })

  test('honors $VISUAL when $EDITOR is unset', async () => {
    delete process.env['EDITOR']
    process.env['VISUAL'] = STUB_EDITOR
    process.env['STUB_EDITOR_CONTENT'] = 'via VISUAL'
    const result = await openInEditor('initial')
    expect(result).toBe('via VISUAL')
  })
})

function restoreEnv(key: string, prev: string | undefined): void {
  if (prev === undefined) delete process.env[key]
  else process.env[key] = prev
}
