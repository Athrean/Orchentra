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

  test('runs OAuth path when pickAuthMethod resolves to oauth', async () => {
    let oauthCalled = false
    const d = deps({
      pickProvider: async () => 'anthropic',
      pickAuthMethod: async () => 'oauth',
      runOAuth: async () => {
        oauthCalled = true
        return { ok: true }
      },
    })
    const r = await runFirstRunFlow(d)
    expect(r).toEqual({ kind: 'saved', provider: 'anthropic' })
    expect(oauthCalled).toBe(true)
    expect(calls(d).saved).toEqual([])
  })

  test('returns cancelled when OAuth flow fails', async () => {
    const d = deps({
      pickProvider: async () => 'anthropic',
      pickAuthMethod: async () => 'oauth',
      runOAuth: async () => ({ ok: false, message: 'denied' }),
    })
    expect(await runFirstRunFlow(d)).toEqual({ kind: 'cancelled' })
  })

  test('returns cancelled when auth-method picker cancels', async () => {
    const d = deps({
      pickProvider: async () => 'anthropic',
      pickAuthMethod: async () => null,
    })
    expect(await runFirstRunFlow(d)).toEqual({ kind: 'cancelled' })
  })

  // Slice 5: after the LLM credential is saved, optionally prompt
  // `Bootstrap GH App now? [Y/n]`. The prompt and the orchestrator are
  // both injected through FirstRunDeps so tests don't touch stdin or
  // the network. The flow still returns `{ kind: 'saved' }` either way
  // — bootstrap is opportunistic, not blocking.
  describe('bootstrap prompt after save', () => {
    test('Y branch invokes runBootstrap once after save', async () => {
      const order: string[] = []
      const bootstrapCalls: number[] = []
      const d: FirstRunDeps = {
        pickProvider: async () => 'openai',
        promptApiKey: async () => 'sk-test',
        save: async () => {
          order.push('save')
        },
        promptBootstrap: async () => {
          order.push('prompt')
          return true
        },
        runBootstrap: async () => {
          order.push('bootstrap')
          bootstrapCalls.push(1)
        },
      }
      const result = await runFirstRunFlow(d)
      expect(result).toEqual({ kind: 'saved', provider: 'openai' })
      expect(bootstrapCalls).toEqual([1])
      expect(order).toEqual(['save', 'prompt', 'bootstrap'])
    })

    test('n branch skips runBootstrap', async () => {
      const bootstrapCalls: number[] = []
      const d = deps({
        promptBootstrap: async () => false,
        runBootstrap: async () => {
          bootstrapCalls.push(1)
        },
      })
      const result = await runFirstRunFlow(d)
      expect(result).toEqual({ kind: 'saved', provider: 'openai' })
      expect(bootstrapCalls).toEqual([])
    })

    test('does not prompt when promptBootstrap is not provided', async () => {
      // Existing first-run callers (reauth, tests, default flow before
      // slice 5) leave both bootstrap hooks unset — the prompt must
      // not fire so the legacy behaviour is preserved exactly.
      let promptFired = false
      const d = deps({
        // No promptBootstrap; supply runBootstrap to prove it's not called.
        runBootstrap: async () => {
          promptFired = true
        },
      })
      const result = await runFirstRunFlow(d)
      expect(result).toEqual({ kind: 'saved', provider: 'openai' })
      expect(promptFired).toBe(false)
    })

    test('does not prompt when the flow ends in cancelled', async () => {
      let prompted = false
      const d = deps({
        promptApiKey: async () => null,
        promptBootstrap: async () => {
          prompted = true
          return true
        },
      })
      const result = await runFirstRunFlow(d)
      expect(result).toEqual({ kind: 'cancelled' })
      expect(prompted).toBe(false)
    })
  })
})
