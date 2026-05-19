import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { InputModal } from '../../src/tui/components/InputModal'

const NO_PASTES = {} as const

describe('InputModal', () => {
  test('renders title row with the multi-line affordance', () => {
    const { lastFrame } = render(
      <InputModal buffer="line1\nline2\nline3\nline4\nline5" cursor={0} pastes={NO_PASTES} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('multi-line edit')
    expect(frame).toContain('ctrl+x ctrl+e')
    expect(frame).toContain('esc to collapse')
  })

  test('renders footer with submit + newline keys', () => {
    const { lastFrame } = render(
      <InputModal buffer="line1\nline2\nline3\nline4\nline5" cursor={0} pastes={NO_PASTES} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('enter to submit')
    expect(frame).toContain('shift+enter')
  })

  test('renders placeholder when buffer empty', () => {
    const { lastFrame } = render(<InputModal buffer="" cursor={0} pastes={NO_PASTES} placeholder="type something" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('type something')
  })

  test('renders buffer content', () => {
    const { lastFrame } = render(<InputModal buffer="hello world" cursor={0} pastes={NO_PASTES} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('hello world')
  })
})
