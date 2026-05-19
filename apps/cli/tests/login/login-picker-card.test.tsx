import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { LoginPickerCard } from '../../src/tui/components/LoginPickerCard'
import { ApiKeyPickerCard } from '../../src/tui/components/ApiKeyPickerCard'
import { ThirdPartyPickerCard } from '../../src/tui/components/ThirdPartyPickerCard'
import { API_KEY_PROVIDERS, THIRD_PARTY_PROVIDERS } from '../../src/login/state-machine'

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

describe('ApiKeyPickerCard', () => {
  test('renders every provider in the registry', () => {
    const { lastFrame } = render(<ApiKeyPickerCard cursor={0} signedIn={new Set()} />)
    const out = lastFrame() ?? ''
    for (const row of API_KEY_PROVIDERS) expect(out).toContain(row.label)
  })
})

describe('ThirdPartyPickerCard', () => {
  test('renders every vendor with its docs URL', () => {
    const { lastFrame } = render(<ThirdPartyPickerCard cursor={0} />)
    const out = lastFrame() ?? ''
    for (const row of THIRD_PARTY_PROVIDERS) {
      expect(out).toContain(row.label)
      expect(out).toContain(row.docsUrl)
    }
  })
})
