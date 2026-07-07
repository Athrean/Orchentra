import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { HistorySearchPrompt } from '../../src/tui/components/HistorySearchPrompt'

const HISTORY = ['git status', 'npm test', 'git push']

describe('HistorySearchPrompt', () => {
  test('shows the query and the matched history entry', () => {
    const { lastFrame } = render(<HistorySearchPrompt search={{ query: 'git', matchIndex: 2 }} history={HISTORY} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('reverse-search')
    expect(out).toContain('git')
    expect(out).toContain('git push')
    expect(out).toContain('enter accept')
  })

  test('shows a prompt to type when the query is empty', () => {
    const { lastFrame } = render(<HistorySearchPrompt search={{ query: '', matchIndex: null }} history={HISTORY} />)
    expect(lastFrame() ?? '').toContain('type to search history')
  })

  test('shows no match when the query matches nothing', () => {
    const { lastFrame } = render(<HistorySearchPrompt search={{ query: 'zzz', matchIndex: null }} history={HISTORY} />)
    expect(lastFrame() ?? '').toContain('no match')
  })
})
