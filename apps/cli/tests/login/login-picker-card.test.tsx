import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { LoginPickerCard } from '../../src/tui/components/LoginPickerCard'

describe('LoginPickerCard', () => {
  test('renders three top-tier rows', () => {
    const { lastFrame } = render(<LoginPickerCard onComplete={() => {}} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('Pro/Max')
    expect(out).toContain('API key')
    expect(out).toContain('3rd-party')
  })

  test('renders Login header and hint footer', () => {
    const { lastFrame } = render(<LoginPickerCard onComplete={() => {}} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('Login')
    expect(out.toLowerCase()).toContain('esc')
  })
})
