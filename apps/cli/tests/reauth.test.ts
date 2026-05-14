import { describe, expect, test } from 'bun:test'
import { runReauth } from '../src/commands/run-reauth'
import type { FirstRunDeps } from '../src/auth/first-run-flow'

function deps(overrides: Partial<FirstRunDeps>): FirstRunDeps {
  return {
    pickProvider: async () => 'anthropic',
    promptApiKey: async () => 'sk-new',
    save: async () => {},
    ...overrides,
  }
}

describe('runReauth', () => {
  test('returns 0 when flow saves a new credential', async () => {
    expect(await runReauth(deps({}))).toBe(0)
  })

  test('returns 1 when flow is cancelled at picker', async () => {
    expect(await runReauth(deps({ pickProvider: async () => null }))).toBe(1)
  })

  test('returns 1 when flow is cancelled at key prompt', async () => {
    expect(await runReauth(deps({ promptApiKey: async () => null }))).toBe(1)
  })

  test('returns 1 when the user submits a blank key', async () => {
    expect(await runReauth(deps({ promptApiKey: async () => '  ' }))).toBe(1)
  })

  test('forwards the provider/apiKey pair to save', async () => {
    let saved: { provider?: string; apiKey?: string } = {}
    const d = deps({
      pickProvider: async () => 'openai',
      promptApiKey: async () => 'sk-x',
      save: async (provider, apiKey) => {
        saved = { provider, apiKey }
      },
    })
    await runReauth(d)
    expect(saved).toEqual({ provider: 'openai', apiKey: 'sk-x' })
  })
})
