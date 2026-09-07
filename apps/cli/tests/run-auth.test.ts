import { describe, expect, test } from 'bun:test'
import { runLogin, type LoginIo } from '../src/commands/run-auth'
import type { ProviderKey } from '@orchentra/cli-api'

function fakeIo(overrides: Partial<LoginIo> = {}): {
  io: LoginIo
  output: string[]
  errors: string[]
  saves: Array<{ provider: ProviderKey; apiKey: string }>
  offered: ProviderKey[]
} {
  const output: string[] = []
  const errors: string[] = []
  const saves: Array<{ provider: ProviderKey; apiKey: string }> = []
  const offered: ProviderKey[] = []
  const pickProvider = overrides.pickProvider ?? (async () => null)
  return {
    output,
    errors,
    saves,
    offered,
    io: {
      canPrompt: true,
      promptApiKey: async () => null,
      promptCode: async () => null,
      openBrowser: async () => {},
      saveApiKey: async (provider, apiKey) => {
        saves.push({ provider, apiKey })
      },
      out: (message) => output.push(message),
      error: (message) => errors.push(message),
      ...overrides,
      // Recorded after the spread so an override's own assertions still run.
      pickProvider: async (options) => {
        offered.push(...options.map((option) => option.value))
        return pickProvider(options)
      },
    },
  }
}

describe('runLogin', () => {
  test('saves an inline API key through shared service', async () => {
    const state = fakeIo({ apiKey: 'sk-test' })

    expect(await runLogin('openai', state.io)).toBe(true)
    expect(state.saves).toEqual([{ provider: 'openai', apiKey: 'sk-test' }])
    expect(state.output).toEqual(['✓ saved openai API key'])
  })

  test('uses provider picker when provider is omitted', async () => {
    const state = fakeIo({
      pickProvider: async (options) => {
        expect(options.map((option) => option.value)).toContain('github')
        return 'xai'
      },
      promptApiKey: async () => 'picked-key',
    })

    expect(await runLogin(undefined, state.io)).toBe(true)
    expect(state.saves).toEqual([{ provider: 'xai', apiKey: 'picked-key' }])
  })

  test('offers the subscription providers alongside the key-only ones', async () => {
    const state = fakeIo({ pickProvider: async () => null })

    expect(await runLogin(undefined, state.io)).toBe(true)
    expect(state.offered).toContain('anthropic')
    expect(state.offered).toContain('openai')
    expect(state.offered).toContain('antigravity')
    expect(state.offered).toContain('zen')
  })

  test('--api-key takes the key path for a provider that also has a browser flow', async () => {
    // `openai` and `anthropic` mean "sign in with the subscription" on their
    // own; an explicit key has to win, or a console user can never store one.
    const state = fakeIo({ apiKey: 'sk-console' })

    expect(await runLogin('openai', state.io)).toBe(true)
    expect(state.saves).toEqual([{ provider: 'openai', apiKey: 'sk-console' }])
  })

  test('gives TUI a shell command for terminal-bound OAuth', async () => {
    const state = fakeIo({ canPrompt: false })

    expect(await runLogin('github', state.io)).toBe(true)
    expect(state.output).toEqual(['Run in a fresh terminal: orchentra login github'])
  })

  test('rejects unsupported providers', async () => {
    const state = fakeIo()

    expect(await runLogin('orchentra', state.io)).toBe(false)
    expect(state.errors.join('\n')).toContain('unknown provider: orchentra')
  })
})
