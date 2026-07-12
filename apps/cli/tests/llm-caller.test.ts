import { describe, expect, test } from 'bun:test'
import type { Provider, ProviderStreamEvent } from '@orchentra/cli-core'
import { buildOneShotLlmCaller } from '../src/composites/llm-caller'

function fakeProvider(events: ProviderStreamEvent[]): Provider {
  return {
    async *stream() {
      for (const e of events) yield e
    },
  }
}

describe('buildOneShotLlmCaller', () => {
  test('collects text deltas and usage from one stream', async () => {
    const provider = fakeProvider([
      { kind: 'text-delta', delta: 'hel' },
      { kind: 'text-delta', delta: 'lo' },
      { kind: 'usage', usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 0, cacheCreationTokens: 0 } },
      { kind: 'finish', stopReason: 'end_turn' },
    ])
    const llm = buildOneShotLlmCaller('claude-sonnet-4-20250514', () => ({ provider, providerName: 'anthropic' }))
    const r = await llm({ systemPrompt: 'sys', userPrompt: 'hi' })
    expect(r.text).toBe('hello')
    expect(r.model).toBe('claude-sonnet-4-20250514')
    expect(r.tokensIn).toBe(12)
    expect(r.tokensOut).toBe(3)
  })

  test('propagates a provider stream failure as a thrown error', async () => {
    const provider: Provider = {
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new Error('provider unavailable')
      },
    }
    const llm = buildOneShotLlmCaller('claude-sonnet-4-20250514', () => ({ provider, providerName: 'anthropic' }))
    expect(llm({ systemPrompt: 's', userPrompt: 'u' })).rejects.toThrow('provider unavailable')
  })

  test('resolves model aliases before building the provider', async () => {
    let seenModel = ''
    const make = (model: string): { provider: Provider; providerName: string } => {
      seenModel = model
      return { provider: fakeProvider([{ kind: 'finish', stopReason: 'end_turn' }]), providerName: 'anthropic' }
    }
    const llm = buildOneShotLlmCaller('sonnet', make)
    await llm({ systemPrompt: 's', userPrompt: 'u' })
    expect(seenModel).not.toBe('sonnet') // alias resolved to a concrete id
  })
})
