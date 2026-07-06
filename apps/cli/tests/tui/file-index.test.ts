import { describe, expect, test, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadFileIndex } from '../../src/tui/suggestions/files'

let dir: string | null = null

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

function scaffold(files: Record<string, string>, gitignore?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'orchentra-file-index-'))
  if (gitignore !== undefined) writeFileSync(join(root, '.gitignore'), gitignore)
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, contents)
  }
  return root
}

describe('loadFileIndex — gitignore-aware', () => {
  test('excludes files and directories matched by the repo .gitignore', async () => {
    dir = scaffold(
      {
        'src/app.ts': 'x',
        'dist/bundle.js': 'x',
        'debug.log': 'x',
        'keep.log': 'x',
      },
      'dist/\n*.log\n!keep.log\n',
    )
    // Fresh cwd each run avoids the module-level 30s cache from a prior test.
    const { entries } = await loadFileIndex(dir)
    expect(entries).toContain('src/app.ts')
    expect(entries).toContain('keep.log') // un-ignored by the ! negation
    expect(entries).not.toContain('dist/bundle.js')
    expect(entries).not.toContain('debug.log')
  })

  test('always skips node_modules even without a .gitignore', async () => {
    dir = scaffold({ 'index.ts': 'x', 'node_modules/pkg/index.js': 'x' })
    const { entries } = await loadFileIndex(dir)
    expect(entries).toContain('index.ts')
    expect(entries.some((e) => e.startsWith('node_modules/'))).toBe(false)
  })
})
