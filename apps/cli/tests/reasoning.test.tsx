import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { initialState, reducer } from '../src/tui/reducer'
import { ReasoningBlock } from '../src/tui/components/ReasoningBlock'
import type { ReasoningRow } from '../src/tui/types'

describe('reducer reasoning actions', () => {
  test('reasoning-begin/append/end builds a single reasoning row', () => {
    let state = initialState({ model: 'm', mode: 'workspace-write' })
    state = reducer(state, { type: 'transcript/reasoning-begin', rowId: 'r1', startedAt: 1000 })
    state = reducer(state, { type: 'transcript/reasoning-append', rowId: 'r1', delta: 'hmm' })
    state = reducer(state, { type: 'transcript/reasoning-append', rowId: 'r1', delta: ' ok' })
    state = reducer(state, { type: 'transcript/reasoning-end', rowId: 'r1', endedAt: 5000 })
    expect(state.transcript.length).toBe(1)
    const row = state.transcript[0]
    expect(row.kind).toBe('reasoning')
    if (row.kind === 'reasoning') {
      expect(row.text).toBe('hmm ok')
      expect(row.startedAt).toBe(1000)
      expect(row.endedAt).toBe(5000)
      expect(row.expanded).toBe(false)
    }
  })

  test('reasoning/toggle-last flips the most recent reasoning row only', () => {
    let state = initialState({ model: 'm', mode: 'workspace-write' })
    state = reducer(state, { type: 'transcript/reasoning-begin', rowId: 'r1', startedAt: 0 })
    state = reducer(state, { type: 'transcript/reasoning-end', rowId: 'r1', endedAt: 100 })
    state = reducer(state, { type: 'transcript/reasoning-begin', rowId: 'r2', startedAt: 200 })
    state = reducer(state, { type: 'transcript/reasoning-end', rowId: 'r2', endedAt: 300 })
    state = reducer(state, { type: 'reasoning/toggle-last' })
    const r1 = state.transcript[0]
    const r2 = state.transcript[1]
    if (r1.kind === 'reasoning' && r2.kind === 'reasoning') {
      expect(r1.expanded).toBe(false)
      expect(r2.expanded).toBe(true)
    }
  })

  test('reasoning/toggle-last is a no-op when no reasoning rows exist', () => {
    const before = initialState({ model: 'm', mode: 'workspace-write' })
    const after = reducer(before, { type: 'reasoning/toggle-last' })
    expect(after).toBe(before)
  })
})

describe('ReasoningBlock', () => {
  function row(opts: Partial<ReasoningRow> = {}): ReasoningRow {
    return {
      kind: 'reasoning',
      id: 'r',
      text: 'hidden thought',
      startedAt: Date.now() - 3000,
      endedAt: Date.now(),
      expanded: false,
      ...opts,
    }
  }

  test('collapsed view hides the body and shows the duration', () => {
    const { lastFrame } = render(<ReasoningBlock row={row()} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('thought for')
    expect(out).not.toContain('hidden thought')
  })

  test('expanded view reveals the full body', () => {
    const { lastFrame } = render(<ReasoningBlock row={row({ expanded: true })} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('hidden thought')
    expect(out).toContain('reasoning')
  })

  test('streaming row (no endedAt) shows live thinking label', () => {
    const { lastFrame } = render(<ReasoningBlock row={row({ endedAt: null, expanded: false })} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('thinking…')
  })
})
