import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyUnifiedPatch, patchFileInWorkspace, contentHash } from '../src/file-ops'
import { filePatchTool } from '../src/tools/file-patch-tool'
import type { SharedToolState, ToolContext } from '@orchentra/cli-core'

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'apply-patch-'))
}

const FILE = [
  'function add(a, b) {',
  '  return a - b',
  '}',
  '',
  'function sub(a, b) {',
  '  return a - b',
  '}',
  '',
].join('\n')

describe('applyUnifiedPatch', () => {
  test('applies a single hunk at the declared position', () => {
    const patch = ['@@ -1,3 +1,3 @@', ' function add(a, b) {', '-  return a - b', '+  return a + b', ' }'].join('\n')
    const { updated, hunksApplied } = applyUnifiedPatch(FILE, patch)
    expect(hunksApplied).toBe(1)
    expect(updated).toContain('return a + b')
    expect(updated).toContain('function sub')
  })

  test('applies multiple hunks with cumulative drift', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' function add(a, b) {',
      '+  // sum',
      '-  return a - b',
      '+  return a + b',
      ' }',
      '@@ -5,3 +6,3 @@',
      ' function sub(a, b) {',
      '-  return a - b',
      '+  return b - a',
      ' }',
    ].join('\n')
    const { updated, hunksApplied } = applyUnifiedPatch(FILE, patch)
    expect(hunksApplied).toBe(2)
    expect(updated).toContain('// sum')
    expect(updated).toContain('return a + b')
    expect(updated).toContain('return b - a')
  })

  test('tolerates ---/+++ file headers and locates drifted hunks by unique search', () => {
    const patch = [
      '--- a/math.js',
      '+++ b/math.js',
      '@@ -40,3 +40,3 @@', // wrong line numbers on purpose
      ' function sub(a, b) {',
      '-  return a - b',
      '+  return b - a',
      ' }',
    ].join('\n')
    const { updated } = applyUnifiedPatch(FILE, patch)
    expect(updated).toContain('return b - a')
    expect(updated).toContain('return a - b') // add() untouched — sub anchored uniquely
  })

  test('ambiguous hunk is rejected, not guessed', () => {
    const patch = ['@@ -2,1 +2,1 @@', '-  return a - b', '+  return a + b'].join('\n')
    // "  return a - b" appears in both functions and the declared position is
    // shared context-free — but position 2 matches exactly, so anchor there.
    const { updated } = applyUnifiedPatch(FILE, patch)
    expect(updated.split('return a + b').length - 1).toBe(1)

    const drifted = ['@@ -99,1 +99,1 @@', '-  return a - b', '+  return a + b'].join('\n')
    expect(() => applyUnifiedPatch(FILE, drifted)).toThrow(/matches 2 locations/)
  })

  test('missing context is rejected with a re-read hint', () => {
    const patch = ['@@ -1,2 +1,2 @@', ' function add(a, b) {', '-  return a * b', '+  return a + b'].join('\n')
    expect(() => applyUnifiedPatch(FILE, patch)).toThrow(/not found — re-read the file/)
  })

  test('a patch without hunk headers is rejected', () => {
    expect(() => applyUnifiedPatch(FILE, '-  return a - b\n+  return a + b')).toThrow(
      /unexpected line before first hunk/,
    )
    expect(() => applyUnifiedPatch(FILE, '')).toThrow(/no hunks/)
  })

  test('blank context lines without the leading space still apply', () => {
    const patch = ['@@ -3,3 +3,3 @@', ' }', '', '-function sub(a, b) {', '+function subtract(a, b) {'].join('\n')
    const { updated } = applyUnifiedPatch(FILE, patch)
    expect(updated).toContain('function subtract')
  })
})

describe('patchFileInWorkspace rails', () => {
  test('patches on disk atomically and reports hunks', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'math.js'), FILE)
    const result = await patchFileInWorkspace(
      'math.js',
      ['@@ -1,3 +1,3 @@', ' function add(a, b) {', '-  return a - b', '+  return a + b', ' }'].join('\n'),
      cwd,
    )
    expect(result.hunksApplied).toBe(1)
    expect(readFileSync(join(cwd, 'math.js'), 'utf8')).toContain('return a + b')
  })

  test('stale-read guard rejects a patch against a changed file', async () => {
    const cwd = tempWorkspace()
    const path = join(cwd, 'math.js')
    writeFileSync(path, FILE)
    const hashes = new Map([[path, contentHash(FILE)]])
    writeFileSync(path, `// moved\n${FILE}`)
    await expect(
      patchFileInWorkspace('math.js', '@@ -1,1 +1,1 @@\n-function add(a, b) {\n+function add(x, y) {', cwd, hashes),
    ).rejects.toThrow(/stale read/)
  })

  test('workspace boundary escape is rejected', async () => {
    const cwd = tempWorkspace()
    await expect(patchFileInWorkspace('../outside.txt', '@@ -1,1 +1,1 @@\n-a\n+b', cwd)).rejects.toThrow()
  })
})

describe('apply_patch tool', () => {
  function ctx(cwd: string): ToolContext {
    return { cwd, sharedState: { fileReadHashes: new Map() } as unknown as SharedToolState } as ToolContext
  }

  test('returns diff evidence and file artifact on success', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'math.js'), FILE)
    const result = await filePatchTool.execute(
      {
        path: 'math.js',
        patch: ['@@ -1,3 +1,3 @@', ' function add(a, b) {', '-  return a - b', '+  return a + b', ' }'].join('\n'),
      },
      ctx(cwd),
    )
    expect(result.isError).toBe(false)
    expect(result.content).toContain('1 hunk(s)')
    expect(result.artifacts?.[0]).toMatchObject({ kind: 'file', action: 'modified' })
    expect(result.evidence?.[0]?.kind).toBe('diff')
  })

  test('missing args and failed patches surface as tool errors', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'math.js'), FILE)
    expect((await filePatchTool.execute({ path: 'math.js' }, ctx(cwd))).isError).toBe(true)
    const bad = await filePatchTool.execute({ path: 'math.js', patch: '@@ -1,1 +1,1 @@\n-nope\n+yep' }, ctx(cwd))
    expect(bad.isError).toBe(true)
    expect(bad.content).toContain('patch error')
  })
})
