import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'

import { CommandRegistry, type CommandHandler } from '../../src/commands/registry'
import { CommandPalette } from '../../src/tui/components/CommandPalette'

function handler(name: string, summary: string, aliases: string[] = []): CommandHandler {
  return {
    spec: { name, aliases, summary },
    execute: async () => true,
  }
}

function registry(): CommandRegistry {
  const r = new CommandRegistry()
  r.register(handler('help', 'List slash commands'))
  r.register(handler('status', 'Show session status'))
  r.register(handler('theme', 'Switch colour theme'))
  return r
}

describe('CommandPalette', () => {
  test('renders slash commands from the registry', () => {
    const { lastFrame } = render(<CommandPalette registry={registry()} onPick={() => {}} onCancel={() => {}} />)
    const out = lastFrame() ?? ''

    expect(out).toContain('Command palette')
    expect(out).toContain('/help')
    expect(out).toContain('List slash commands')
    expect(out).toContain('/status')
    expect(out).toContain('/theme')
  })

  test('fuzzy filters commands as the user types', async () => {
    const { lastFrame, stdin } = render(<CommandPalette registry={registry()} onPick={() => {}} onCancel={() => {}} />)

    stdin.write('st')
    await new Promise((resolve) => setTimeout(resolve, 60))

    const out = lastFrame() ?? ''
    expect(out).toContain('/status')
    expect(out).not.toContain('/help')
  })

  test('Enter selects the highlighted command', async () => {
    let picked: string | null = null
    const { stdin } = render(
      <CommandPalette
        registry={registry()}
        onPick={(command) => {
          picked = command
        }}
        onCancel={() => {}}
      />,
    )

    stdin.write('th')
    await new Promise((resolve) => setTimeout(resolve, 60))
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(picked).toBe('/theme')
  })

  test('Esc closes the palette', async () => {
    let cancelled = false
    const { stdin } = render(
      <CommandPalette
        registry={registry()}
        onPick={() => {}}
        onCancel={() => {
          cancelled = true
        }}
      />,
    )

    stdin.write('\x1b')
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(cancelled).toBe(true)
  })
})
