import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendCompactionNote, compactionNotesPath, renderCompactionNote } from '../src/runtime/compaction-notes'
import type { CompactionResult } from '../src/runtime/compaction'

const result: CompactionResult = {
  messages: [],
  summary: 'user asked for X; agent edited Y',
  tokensSaved: 1234,
  droppedCount: 7,
  compacted: true,
}

describe('compaction notes', () => {
  test('path is per-session under .orchentra', () => {
    expect(compactionNotesPath('/repo', 'abc')).toBe('/repo/.orchentra/sessions/abc/NOTES.md')
  })

  test('render includes timestamp, counts, and the summary', () => {
    const note = renderCompactionNote('2026-07-13T00:00:00.000Z', result)
    expect(note).toContain('## Compaction — 2026-07-13T00:00:00.000Z')
    expect(note).toContain('dropped 7 message(s), ~1234 tokens saved')
    expect(note).toContain('user asked for X; agent edited Y')
  })

  test('append creates directories and accumulates notes across compactions', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'compaction-notes-'))
    const path = compactionNotesPath(cwd, 'sess')

    await appendCompactionNote(path, renderCompactionNote('t1', result))
    await appendCompactionNote(path, renderCompactionNote('t2', { ...result, summary: 'second pass' }))

    const content = readFileSync(path, 'utf8')
    expect(content).toContain('## Compaction — t1')
    expect(content).toContain('## Compaction — t2')
    expect(content).toContain('second pass')
    expect(content.indexOf('t1')).toBeLessThan(content.indexOf('t2'))
  })
})
