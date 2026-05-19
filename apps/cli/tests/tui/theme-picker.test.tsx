import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'

import { ThemePicker } from '../../src/tui/components/ThemePicker'
import { themeNames } from '../../src/tui/theme-registry'

describe('ThemePicker', () => {
  test('renders every registered theme on its own line', () => {
    const { lastFrame } = render(<ThemePicker current="dark" onPick={() => {}} onCancel={() => {}} />)
    const out = lastFrame() ?? ''
    for (const name of themeNames()) expect(out).toContain(name)
  })

  test('renders a Theme header and hint footer', () => {
    const { lastFrame } = render(<ThemePicker current="dark" onPick={() => {}} onCancel={() => {}} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('Theme')
    expect(out.toLowerCase()).toContain('esc')
    expect(out.toLowerCase()).toContain('enter')
  })

  test('marks the current theme with a (current) tag', () => {
    const { lastFrame } = render(<ThemePicker current="light" onPick={() => {}} onCancel={() => {}} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('(current)')
    // The (current) tag should sit on the light row, not the dark row.
    const lightLine = out.split('\n').find((l) => l.includes('light') && l.includes('(current)'))
    expect(lightLine).toBeDefined()
  })

  test('starts the cursor on the current theme', () => {
    const { lastFrame } = render(<ThemePicker current="light" onPick={() => {}} onCancel={() => {}} />)
    const out = lastFrame() ?? ''
    const lightLine = out.split('\n').find((l) => l.includes('light'))
    expect(lightLine ?? '').toMatch(/❯/)
  })

  test('arrow-key navigation moves the cursor down', async () => {
    const { lastFrame, stdin } = render(<ThemePicker current="dark" onPick={() => {}} onCancel={() => {}} />)
    stdin.write('\x1b[B')
    await new Promise((r) => setTimeout(r, 10))
    const out = lastFrame() ?? ''
    const lightLine = out.split('\n').find((l) => l.includes('light'))
    expect(lightLine ?? '').toMatch(/❯/)
  })

  test('Enter commits with the highlighted theme', async () => {
    let picked: string | null = null
    const { stdin } = render(
      <ThemePicker
        current="dark"
        onPick={(name) => {
          picked = name
        }}
        onCancel={() => {}}
      />,
    )
    stdin.write('\x1b[B')
    await new Promise((r) => setTimeout(r, 10))
    stdin.write('\r')
    await new Promise((r) => setTimeout(r, 10))
    expect(picked).toBe('light')
  })

  test('Ctrl+C invokes onCancel', async () => {
    let cancelled = false
    const { stdin } = render(
      <ThemePicker
        current="dark"
        onPick={() => {}}
        onCancel={() => {
          cancelled = true
        }}
      />,
    )
    stdin.write('\x03')
    await new Promise((r) => setTimeout(r, 10))
    expect(cancelled).toBe(true)
  })

  test('preview prop renders without crashing on every theme', () => {
    for (const name of themeNames()) {
      const { lastFrame } = render(<ThemePicker current="dark" preview={name} onPick={() => {}} onCancel={() => {}} />)
      expect(lastFrame() ?? '').toContain('Theme')
    }
  })
})
