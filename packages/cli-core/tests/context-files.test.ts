import { describe, expect, test } from 'bun:test'
import { collectContextFiles } from '../src/runtime/context-files'
import type { ChatMessage } from '../src/runtime/provider'

function read(path: string): ChatMessage {
  return {
    role: 'assistant',
    content: '',
    toolCalls: [{ id: `t-${path}`, name: 'read_file', input: { path } }],
  }
}

describe('collectContextFiles', () => {
  test('lists distinct files read into context', () => {
    const files = collectContextFiles([read('src/a.ts'), read('src/b.ts')])
    expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(files.every((f) => f.reads === 1)).toBe(true)
  })

  test('counts repeated reads and sorts most-read first', () => {
    const files = collectContextFiles([read('src/a.ts'), read('src/b.ts'), read('src/b.ts')])
    expect(files).toEqual([
      { path: 'src/b.ts', reads: 2 },
      { path: 'src/a.ts', reads: 1 },
    ])
  })

  test('ties broken alphabetically', () => {
    const files = collectContextFiles([read('src/z.ts'), read('src/a.ts')])
    expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'src/z.ts'])
  })

  test('ignores non-read_file tool calls and malformed paths', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'bash', input: { command: 'ls' } }] },
      { role: 'assistant', content: '', toolCalls: [{ id: '2', name: 'read_file', input: { path: '' } }] },
      { role: 'assistant', content: '', toolCalls: [{ id: '3', name: 'read_file', input: {} }] },
      { role: 'user', content: 'hi' },
    ]
    expect(collectContextFiles(messages)).toEqual([])
  })
})
