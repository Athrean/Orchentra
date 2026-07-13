import { describe, expect, test } from 'bun:test'
import { runLogin, type LoginIo } from '../src/commands/run-auth'
import type { ProviderKey } from '@orchentra/cli-api'

function fakeIo(overrides: Partial<LoginIo> = {}): {
  io: LoginIo
  output: string[]
  errors: string[]
  saves: Array<{ provider: ProviderKey; apiKey: string }>
} {
  const output: string[] = []
  const errors: string[] = []
  const saves: Array<{ provider: ProviderKey; apiKey: string }> = []
  return {
    output,
    errors,
    saves,
    io: {
      canPrompt: true,
      pickProvider: async () => null,
      promptApiKey: async () => null,
      openBrowser: async () => {},
      saveApiKey: async (provider, apiKey) => {
        saves.push({ provider, apiKey })
      },
      out: (message) => output.push(message),
      error: (message) => errors.push(message),
      ...overrides,
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
        return 'openai'
      },
      promptApiKey: async () => 'picked-key',
    })

    expect(await runLogin(undefined, state.io)).toBe(true)
    expect(state.saves).toEqual([{ provider: 'openai', apiKey: 'picked-key' }])
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
