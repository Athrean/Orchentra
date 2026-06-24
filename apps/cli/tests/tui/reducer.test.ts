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

  test('mode/cycle wraps through the Shift+Tab permission ladder', () => {
    let s = initialState({ model: 'claude-sonnet-4-20250514', mode: 'read-only' })
    expect(s.mode).toBe('read-only')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('workspace-write')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('danger-full-access')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('prompt')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('allow')
    s = reducer(s, { type: 'mode/cycle' })
    expect(s.mode).toBe('read-only')
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

  test('verb/rotate replaces verb while running', () => {
    let s = reducer(base(), { type: 'turn/start' })
    const first = s.turn.verb
    s = reducer(s, { type: 'verb/rotate', verb: 'Smelting' })
    expect(s.turn.verb).toBe('Smelting')
    expect(s.turn.verb).not.toBe(first === 'Smelting' ? null : first)
  })

  test('verb/rotate is a no-op while idle', () => {
    const s = reducer(base(), { type: 'verb/rotate', verb: 'Smelting' })
    expect(s.turn.state).toBe('idle')
    expect(s.turn.verb).toBeNull()
  })

  test('tool-args-append creates a pending tool_call row on first delta', () => {
    const s = reducer(base(), {
      type: 'transcript/tool-args-append',
      toolUseId: 'tool-1',
      toolName: 'read_file',
      delta: '{"path',
    })
    expect(s.transcript).toHaveLength(1)
    const row = s.transcript[0]
    expect(row.kind).toBe('tool_call')
    if (row.kind === 'tool_call') {
      expect(row.toolUseId).toBe('tool-1')
      expect(row.name).toBe('read_file')
      expect(row.input).toBe('{"path')
      expect(row.streaming).toBe(true)
    }
  })

  test('tool-args-append appends concatenated partial JSON to the same row', () => {
    let s = reducer(base(), {
      type: 'transcript/tool-args-append',
      toolUseId: 'tool-1',
      toolName: 'read_file',
      delta: '{"path',
    })
    s = reducer(s, {
      type: 'transcript/tool-args-append',
      toolUseId: 'tool-1',
      toolName: 'read_file',
      delta: '":"/tmp/',
    })
    s = reducer(s, {
      type: 'transcript/tool-args-append',
      toolUseId: 'tool-1',
      toolName: 'read_file',
      delta: 'f.txt"}',
    })
    expect(s.transcript).toHaveLength(1)
    const row = s.transcript[0]
    expect(row.kind).toBe('tool_call')
    if (row.kind === 'tool_call') {
      expect(row.input).toBe('{"path":"/tmp/f.txt"}')
      expect(row.streaming).toBe(true)
    }
  })

  test('tool-args-finalize replaces partial input with finalized JSON and clears streaming', () => {
    let s = reducer(base(), {
      type: 'transcript/tool-args-append',
      toolUseId: 'tool-1',
      toolName: 'read_file',
      delta: '{"path":"/tmp/f.txt',
    })
    s = reducer(s, {
      type: 'transcript/tool-args-finalize',
      toolUseId: 'tool-1',
      input: '{"path":"/tmp/f.txt"}',
    })
    expect(s.transcript).toHaveLength(1)
    const row = s.transcript[0]
    expect(row.kind).toBe('tool_call')
    if (row.kind === 'tool_call') {
      expect(row.input).toBe('{"path":"/tmp/f.txt"}')
      expect(row.streaming).toBe(false)
    }
  })

  test('tool-args-finalize without a prior partial creates a finalized row', () => {
    const s = reducer(base(), {
      type: 'transcript/tool-args-finalize',
      toolUseId: 'tool-2',
      toolName: 'write_file',
      input: '{"path":"a"}',
    })
    expect(s.transcript).toHaveLength(1)
    const row = s.transcript[0]
    expect(row.kind).toBe('tool_call')
    if (row.kind === 'tool_call') {
      expect(row.toolUseId).toBe('tool-2')
      expect(row.name).toBe('write_file')
      expect(row.input).toBe('{"path":"a"}')
      expect(row.streaming).toBe(false)
    }
  })
})
