import { describe, expect, test } from 'bun:test'
import { countUserTurns, lineDiffStats, rewindBoundary } from '../src/runtime/rewind'
import type { ChatMessage } from '../src/runtime/provider'

// Three turns: user/assistant, user/assistant+tool, user/assistant.
const convo: ChatMessage[] = [
  { role: 'user', content: 'one' },
  { role: 'assistant', content: 'a1' },
  { role: 'user', content: 'two' },
  { role: 'assistant', content: 'a2' },
  { role: 'tool', content: 't2', toolCallId: 'x' },
  { role: 'user', content: 'three' },
  { role: 'assistant', content: 'a3' },
]

describe('rewindBoundary', () => {
  test('turns <= 0 keeps everything', () => {
    expect(rewindBoundary(convo, 0)).toBe(convo.length)
    expect(rewindBoundary(convo, -1)).toBe(convo.length)
  })

  test('drops the last turn at the last user message', () => {
    // last user message ("three") is at index 5.
    expect(rewindBoundary(convo, 1)).toBe(5)
    // keeps turn 2 intact, whose last message is its tool result.
    expect(convo.slice(0, rewindBoundary(convo, 1)).at(-1)?.content).toBe('t2')
  })

  test('drops two turns back to the second user message', () => {
    expect(rewindBoundary(convo, 2)).toBe(2) // "two" is at index 2
  })

  test('turns >= user turns truncates to empty', () => {
    expect(rewindBoundary(convo, 3)).toBe(0)
    expect(rewindBoundary(convo, 99)).toBe(0)
  })
})

describe('countUserTurns', () => {
  test('counts user messages only', () => {
    expect(countUserTurns(convo)).toBe(3)
    expect(countUserTurns(convo.slice(5))).toBe(1)
    expect(countUserTurns([])).toBe(0)
  })
})

describe('lineDiffStats', () => {
  test('empty to content is all added, none removed', () => {
    expect(lineDiffStats('', 'a\nb')).toEqual({ added: 2, removed: 0 })
  })

  test('content to empty is all removed, none added', () => {
    expect(lineDiffStats('a\nb\nc', '')).toEqual({ added: 0, removed: 3 })
  })

  test('identical content changes nothing', () => {
    expect(lineDiffStats('a\nb\nc', 'a\nb\nc')).toEqual({ added: 0, removed: 0 })
  })

  test('counts only the lines that differ, ignoring order', () => {
    // shared: a, c. removed: b. added: x, y.
    expect(lineDiffStats('a\nb\nc', 'c\na\nx\ny')).toEqual({ added: 2, removed: 1 })
  })

  test('accounts for duplicate lines by multiplicity', () => {
    expect(lineDiffStats('x\nx\nx', 'x')).toEqual({ added: 0, removed: 2 })
    expect(lineDiffStats('x', 'x\nx\nx')).toEqual({ added: 2, removed: 0 })
  })
})
