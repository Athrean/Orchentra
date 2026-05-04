import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { CollapsibleBlock } from '../src/tui/components/CollapsibleBlock'

const FIVE_LINES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']

describe('CollapsibleBlock', () => {
  test('collapsed frame shows the head + summary with hidden-line count', () => {
    const { lastFrame } = render(<CollapsibleBlock lines={FIVE_LINES} expanded={false} collapsedTo={2} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('alpha')
    expect(out).toContain('beta')
    expect(out).not.toContain('gamma')
    expect(out).toContain('… +3 lines (ctrl+o to expand)')
  })

  test('expanded frame shows every line + collapse hint', () => {
    const { lastFrame } = render(<CollapsibleBlock lines={FIVE_LINES} expanded={true} collapsedTo={2} />)
    const out = lastFrame() ?? ''
    for (const line of FIVE_LINES) {
      expect(out).toContain(line)
    }
    expect(out).not.toContain('+3 lines')
    expect(out).toContain('(ctrl+o to collapse)')
  })

  test('content shorter than collapsedTo renders as-is with no summary', () => {
    const { lastFrame } = render(<CollapsibleBlock lines={['only one']} expanded={false} collapsedTo={3} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('only one')
    expect(out).not.toContain('+0 lines')
    expect(out).not.toContain('to expand')
    expect(out).not.toContain('to collapse')
  })

  test('singular "1 line" copy when one line is hidden', () => {
    const { lastFrame } = render(<CollapsibleBlock lines={['a', 'b', 'c']} expanded={false} collapsedTo={2} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('… +1 line (ctrl+o to expand)')
  })

  test('summaryHidden overrides line counting (caller pre-truncated)', () => {
    const { lastFrame } = render(
      <CollapsibleBlock lines={['head one', 'head two']} expanded={false} collapsedTo={2} summaryHidden={42} />,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('head one')
    expect(out).toContain('… +42 lines (ctrl+o to expand)')
  })

  test('custom hints replace the default ctrl+o copy', () => {
    const { lastFrame } = render(
      <CollapsibleBlock
        lines={FIVE_LINES}
        expanded={false}
        collapsedTo={2}
        expandHint="(ctrl+r to expand)"
        collapseHint="(ctrl+r to collapse)"
      />,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('(ctrl+r to expand)')
    expect(out).not.toContain('ctrl+o')
  })
})
