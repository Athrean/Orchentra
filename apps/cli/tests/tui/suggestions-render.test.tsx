import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { Suggestions } from '../../src/tui/components/Suggestions'
import type { SuggestionState } from '../../src/tui/types'

function makeState(items: SuggestionState['items'], selected = 0): SuggestionState {
  return {
    open: true,
    trigger: '/',
    query: '',
    items,
    selected,
    anchorStart: 0,
  }
}

describe('Suggestions render', () => {
  test('renders without a rounded border box', () => {
    const state = makeState([
      { value: '/help', label: 'help', description: 'list commands' },
      { value: '/status', label: 'status', description: 'inspect session' },
    ])
    const { lastFrame } = render(<Suggestions state={state} width={60} />)
    const out = lastFrame() ?? ''
    expect(out).not.toMatch(/[╭╮╰╯│]/)
  })

  test('omits the internal header and footer hint', () => {
    const state = makeState([{ value: '/help', label: 'help', description: 'show help' }])
    const { lastFrame } = render(<Suggestions state={state} width={60} />)
    const out = lastFrame() ?? ''
    expect(out).not.toMatch(/\/ commands/)
    expect(out).not.toContain('select')
    expect(out).not.toContain('Esc')
  })

  test('aligns descriptions to a common column across rows', () => {
    const state = makeState([
      { value: '/a', label: 'a', description: 'first' },
      { value: '/longname', label: 'longname', description: 'second' },
    ])
    const { lastFrame } = render(<Suggestions state={state} width={60} />)
    const out = lastFrame() ?? ''
    const lines = out.split('\n').filter((l) => l.trim().length > 0)
    expect(lines.length).toBe(2)
    const col0 = lines[0]!.indexOf('first')
    const col1 = lines[1]!.indexOf('second')
    expect(col0).toBe(col1)
    expect(col0).toBeGreaterThan(0)
  })

  test('truncates long descriptions with an ellipsis', () => {
    const longDesc = 'this is a very long description that should be cut off well before the end of the line'
    const state = makeState([{ value: '/x', label: 'x', description: longDesc }])
    const { lastFrame } = render(<Suggestions state={state} width={30} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('…')
    expect(out).not.toContain('end of the line')
  })

  test('marks the selected row with a brand prefix glyph', () => {
    const state = makeState(
      [
        { value: '/a', label: 'a', description: 'first' },
        { value: '/b', label: 'b', description: 'second' },
      ],
      1,
    )
    const { lastFrame } = render(<Suggestions state={state} width={60} />)
    const out = lastFrame() ?? ''
    const lines = out.split('\n').filter((l) => l.trim().length > 0)
    expect(lines[0]!.startsWith('  ')).toBe(true)
    expect(lines[1]!.trimStart().startsWith('›') || lines[1]!.trimStart().startsWith('>')).toBe(true)
  })
})
