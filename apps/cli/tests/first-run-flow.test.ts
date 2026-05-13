import { describe, expect, test } from 'bun:test'
import { runFirstRunFlow, type FirstRunDeps, type FirstRunResult } from '../src/auth/first-run-flow'
import type { ProviderKey } from '@orchentra/cli-api'

function deps(overrides: Partial<FirstRunDeps>): FirstRunDeps {
  const calls: { saved: Array<{ provider: ProviderKey; apiKey: string }> } = { saved: [] }
  const base: FirstRunDeps = {
    pickProvider: async () => 'openai',
    promptApiKey: async () => 'sk-test',
    save: async (provider, apiKey) => {
      calls.saved.push({ provider, apiKey })
    },
    ...overrides,
  }
  ;(base as unknown as { __calls: typeof calls }).__calls = calls
  return base
}

function calls(d: FirstRunDeps): { saved: Array<{ provider: ProviderKey; apiKey: string }> } {
  return (d as unknown as { __calls: { saved: Array<{ provider: ProviderKey; apiKey: string }> } }).__calls
}

describe('runFirstRunFlow', () => {
  test('picks provider, prompts for key, saves, returns saved', async () => {
    const d = deps({})
    const result: FirstRunResult = await runFirstRunFlow(d)
    expect(result).toEqual({ kind: 'saved', provider: 'openai' })
    expect(calls(d).saved).toEqual([{ provider: 'openai', apiKey: 'sk-test' }])
  })

  test('returns cancelled when provider picker cancels', async () => {
    const d = deps({ pickProvider: async () => null })
    expect(await runFirstRunFlow(d)).toEqual({ kind: 'cancelled' })
    expect(calls(d).saved).toEqual([])
  })

  test('returns cancelled when api key prompt cancels', async () => {
    const d = deps({ promptApiKey: async () => null })
    expect(await runFirstRunFlow(d)).toEqual({ kind: 'cancelled' })
    expect(calls(d).saved).toEqual([])
  })

  test('treats blank api key as cancellation', async () => {
    const d = deps({ promptApiKey: async () => '   ' })
    expect(await runFirstRunFlow(d)).toEqual({ kind: 'cancelled' })
    expect(calls(d).saved).toEqual([])
  })

  test('trims surrounding whitespace from api key before saving', async () => {
    const d = deps({ promptApiKey: async () => '  sk-with-space  ' })
    await runFirstRunFlow(d)
    expect(calls(d).saved).toEqual([{ provider: 'openai', apiKey: 'sk-with-space' }])
  })

  test('propagates the chosen provider to save', async () => {
    const d = deps({ pickProvider: async () => 'anthropic', promptApiKey: async () => 'sk-anthro' })
    const r = await runFirstRunFlow(d)
    expect(r).toEqual({ kind: 'saved', provider: 'anthropic' })
    expect(calls(d).saved[0]?.provider).toBe('anthropic')
  })
})
