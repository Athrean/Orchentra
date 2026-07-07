import { describe, expect, test } from 'bun:test'
import { buildToolDiffPreview } from '../src/tui/components/tool-diff-preview'

describe('buildToolDiffPreview', () => {
  test('renders edit_file as a git-style diff of old_string → new_string', () => {
    const diff = buildToolDiffPreview(
      'edit_file',
      JSON.stringify({ path: 'src/app.ts', old_string: 'const a = 1', new_string: 'const a = 2' }),
    )
    expect(diff).not.toBeNull()
    expect(diff).toContain('diff --git a/src/app.ts b/src/app.ts')
    expect(diff).toContain('-const a = 1')
    expect(diff).toContain('+const a = 2')
  })

  test('renders write_file content as all-additions under the file header', () => {
    const diff = buildToolDiffPreview('write_file', JSON.stringify({ path: 'new.txt', content: 'line one\nline two' }))
    expect(diff).toContain('diff --git a/new.txt b/new.txt')
    expect(diff).toContain('+line one')
    expect(diff).toContain('+line two')
    // A fresh write has no deletion lines.
    expect((diff ?? '').split('\n').some((l) => l.startsWith('-'))).toBe(false)
  })

  test('preserves multi-line old/new blocks in order', () => {
    const diff = buildToolDiffPreview(
      'edit_file',
      JSON.stringify({ path: 'f.ts', old_string: 'a\nb', new_string: 'a\nc' }),
    )
    const lines = (diff ?? '').split('\n')
    expect(lines).toEqual(['diff --git a/f.ts b/f.ts', '-a', '-b', '+a', '+c'])
  })

  test('returns null for non-file-editing tools', () => {
    expect(buildToolDiffPreview('bash', JSON.stringify({ command: 'ls' }))).toBeNull()
    expect(buildToolDiffPreview('read_file', JSON.stringify({ path: 'x' }))).toBeNull()
  })

  test('returns null on malformed json or missing fields', () => {
    expect(buildToolDiffPreview('edit_file', 'not json')).toBeNull()
    expect(buildToolDiffPreview('edit_file', JSON.stringify({ path: 'x' }))).toBeNull()
    expect(buildToolDiffPreview('write_file', JSON.stringify({ content: 'x' }))).toBeNull()
  })
})
