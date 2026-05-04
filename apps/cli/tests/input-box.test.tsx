import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { InputBox } from '../src/tui/components/InputBox'

describe('InputBox multi-line hint', () => {
  test('shows shift+enter hint when buffer contains a newline', () => {
    const { lastFrame } = render(<InputBox buffer={'line one\nline two'} cursor={9} pastes={{}} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('shift+enter')
  })

  test('does not show hint for single-line buffers', () => {
    const { lastFrame } = render(<InputBox buffer={'just one line'} cursor={5} pastes={{}} />)
    const out = lastFrame() ?? ''
    expect(out).not.toContain('shift+enter')
  })

  test('does not show hint for an empty buffer', () => {
    const { lastFrame } = render(<InputBox buffer={''} cursor={0} pastes={{}} placeholder="…" />)
    const out = lastFrame() ?? ''
    expect(out).not.toContain('shift+enter')
  })
})
