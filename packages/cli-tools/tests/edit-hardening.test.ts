import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { editFileInWorkspace, readFileInWorkspace, writeFileInWorkspace, contentHash } from '../src/file-ops'
import { fileEditTool } from '../src/tools/file-edit-tool'
import { fileReadTool } from '../src/tools/file-read-tool'
import type { SharedToolState, ToolContext } from '@orchentra/cli-core'

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'edit-hardening-'))
}

function sharedState(): SharedToolState {
  return {
    taskStore: {
      create: () => {
        throw new Error('unused')
      },
      get: () => undefined,
      list: () => [],
      update: () => {},
      cancel: () => {},
    },
    todos: [],
    agentCounter: 0,
    planMode: false,
    fileReadHashes: new Map(),
  }
}

describe('unique-match rejection', () => {
  test('ambiguous old_string is rejected with the occurrence count', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'a.txt'), 'foo bar foo baz foo')

    await expect(editFileInWorkspace('a.txt', 'foo', 'qux', false, cwd)).rejects.toThrow(/matches 3 times/)
    expect(readFileSync(join(cwd, 'a.txt'), 'utf8')).toBe('foo bar foo baz foo')
  })

  test('replace_all accepts multiple occurrences', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'a.txt'), 'foo bar foo')

    await editFileInWorkspace('a.txt', 'foo', 'qux', true, cwd)
    expect(readFileSync(join(cwd, 'a.txt'), 'utf8')).toBe('qux bar qux')
  })

  test('unique match still edits', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'a.txt'), 'alpha beta gamma')

    await editFileInWorkspace('a.txt', 'beta', 'delta', false, cwd)
    expect(readFileSync(join(cwd, 'a.txt'), 'utf8')).toBe('alpha delta gamma')
  })
})

describe('stale-read guard', () => {
  test('edit is rejected when the file changed since the recorded read', async () => {
    const cwd = tempWorkspace()
    const path = join(cwd, 'b.txt')
    writeFileSync(path, 'original content')
    const hashes = new Map<string, string>()

    await readFileInWorkspace('b.txt', cwd, undefined, undefined, hashes)
    writeFileSync(path, 'changed underneath')

    await expect(editFileInWorkspace('b.txt', 'changed', 'edited', false, cwd, hashes)).rejects.toThrow(/stale read/)
    expect(readFileSync(path, 'utf8')).toBe('changed underneath')
  })

  test('edit after a fresh read succeeds and re-arms for consecutive edits', async () => {
    const cwd = tempWorkspace()
    const path = join(cwd, 'c.txt')
    writeFileSync(path, 'one two three')
    const hashes = new Map<string, string>()

    await readFileInWorkspace('c.txt', cwd, undefined, undefined, hashes)
    await editFileInWorkspace('c.txt', 'one', '1', false, cwd, hashes)
    await editFileInWorkspace('c.txt', 'two', '2', false, cwd, hashes)
    expect(readFileSync(path, 'utf8')).toBe('1 2 three')
  })

  test('a write updates the recorded hash so a following edit is not stale', async () => {
    const cwd = tempWorkspace()
    const hashes = new Map<string, string>()

    await writeFileInWorkspace('d.txt', 'written fresh', cwd, hashes)
    await editFileInWorkspace('d.txt', 'fresh', 'anew', false, cwd, hashes)
    expect(readFileSync(join(cwd, 'd.txt'), 'utf8')).toBe('written anew')
  })

  test('no recorded hash means no guard (back-compat for unread files)', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'e.txt'), 'never read')

    await editFileInWorkspace('e.txt', 'never', 'not', false, cwd, new Map())
    expect(readFileSync(join(cwd, 'e.txt'), 'utf8')).toBe('not read')
  })

  test('read tool records the full-file hash into shared state; edit tool honors it', async () => {
    const cwd = tempWorkspace()
    const path = join(cwd, 'f.txt')
    writeFileSync(path, 'line1\nline2\nline3\n')
    const state = sharedState()
    const ctx: ToolContext = { sessionId: 'test', cwd, sharedState: state }

    // Partial read must still record the FULL file hash.
    await fileReadTool.execute({ path: 'f.txt', offset: 0, limit: 1 }, ctx)
    expect(state.fileReadHashes!.get(path)).toBe(contentHash('line1\nline2\nline3\n'))

    writeFileSync(path, 'line1\nCHANGED\nline3\n')
    const result = await fileEditTool.execute({ path: 'f.txt', old_string: 'line3', new_string: 'line4' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.content).toContain('stale read')
  })
})

describe('atomic writes', () => {
  test('no temp files remain after writes and edits', async () => {
    const cwd = tempWorkspace()
    await writeFileInWorkspace('g.txt', 'v1', cwd)
    await editFileInWorkspace('g.txt', 'v1', 'v2', false, cwd)

    expect(readFileSync(join(cwd, 'g.txt'), 'utf8')).toBe('v2')
    expect(readdirSync(cwd)).toEqual(['g.txt'])
  })
})
