import { describe, expect, test } from 'bun:test'
import { initialState, reducer } from '../../src/tui/reducer'

const base = (): ReturnType<typeof initialState> => initialState({ model: 'claude-sonnet-4-20250514', mode: 'prompt' })

describe('tui reducer', () => {
  test('buffer/set clamps cursor', () => {
    const s = reducer(base(), { type: 'buffer/set', buffer: 'hello', cursor: 100 })
    expect(s.buffer).toBe('hello')
    expect(s.cursor).toBe(5)
  })

  test('history prev/next round-trips through draft', () => {
    let s = reducer(base(), { type: 'history/load', entries: ['first', 'second', 'third'] })
    s = reducer(s, { type: 'buffer/set', buffer: 'draft', cursor: 5 })
    s = reducer(s, { type: 'history/prev' })
    expect(s.buffer).toBe('third')
    expect(s.draft).toBe('draft')
    s = reducer(s, { type: 'history/prev' })
    expect(s.buffer).toBe('second')
    s = reducer(s, { type: 'history/next' })
    expect(s.buffer).toBe('third')
    s = reducer(s, { type: 'history/next' })
    expect(s.buffer).toBe('draft')
    expect(s.historyIndex).toBe(-1)
  })

  test('history/append dedupes consecutive duplicates', () => {
    let s = reducer(base(), { type: 'history/append', text: 'hello' })
    s = reducer(s, { type: 'history/append', text: 'hello' })
    s = reducer(s, { type: 'history/append', text: 'world' })
    expect(s.history).toEqual(['hello', 'world'])
  })

  test('mode/cycle wraps through every mode', () => {
    let s = base()
    expect(s.mode).toBe('prompt')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('workspace-write')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('read-only')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('allow')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('danger-full-access')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('prompt')
  })

  test('suggestions move wraps and respects empty state', () => {
    const s0 = reducer(base(), { type: 'suggestions/move', delta: 1 })
    expect(s0.suggestions.selected).toBe(0)

    const opened = reducer(s0, {
      type: 'suggestions/set',
      state: {
        open: true,
        trigger: '/',
        query: '',
        items: [
          { value: '/help', label: 'help' },
          { value: '/exit', label: 'exit' },
        ],
        selected: 0,
        anchorStart: 0,
      },
    })
    const moved = reducer(opened, { type: 'suggestions/move', delta: -1 })
    expect(moved.suggestions.selected).toBe(1)
  })

  test('transcript stream begin/append/end maintains a single row', () => {
    let s = reducer(base(), { type: 'transcript/stream-begin', rowId: 'abc' })
    s = reducer(s, { type: 'transcript/stream-append', rowId: 'abc', delta: 'hello ' })
    s = reducer(s, { type: 'transcript/stream-append', rowId: 'abc', delta: 'world' })
    s = reducer(s, { type: 'transcript/stream-end' })
    expect(s.transcript).toHaveLength(1)
    const row = s.transcript[0]
    expect(row.kind).toBe('assistant')
    if (row.kind === 'assistant') expect(row.text).toBe('hello world')
    expect(s.streamingRowId).toBeNull()
  })

  test('turn/start sets running and turn/end clears stream id', () => {
    let s = reducer(base(), { type: 'turn/start' })
    expect(s.turn.state).toBe('running')
    expect(s.turn.startedAt).toBeGreaterThan(0)
    s = reducer(s, { type: 'transcript/stream-begin', rowId: 'r1' })
    s = reducer(s, { type: 'turn/end' })
    expect(s.turn.state).toBe('idle')
    expect(s.streamingRowId).toBeNull()
  })
})
