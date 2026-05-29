import { describe, expect, it } from 'bun:test'
import { chooseProviderAndModel } from '../lib/ai/provider'

describe('chooseProviderAndModel', () => {
  it('returns null when nothing is configured', () => {
    expect(chooseProviderAndModel({})).toBeNull()
  })

  it('uses the only configured provider and its default model', () => {
    expect(chooseProviderAndModel({ openai: { defaultModel: 'gpt-4o' } })).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o',
    })
  })

  it('prefers anthropic over openai when both are configured', () => {
    const choice = chooseProviderAndModel({
      anthropic: { defaultModel: 'claude-sonnet-4-6' },
      openai: { defaultModel: 'gpt-4o' },
    })
    expect(choice).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4-6' })
  })

  it('honors a requested model when its provider is configured', () => {
    const choice = chooseProviderAndModel({ anthropic: { defaultModel: 'claude-sonnet-4-6' } }, 'claude-opus-4-8')
    expect(choice).toEqual({ provider: 'anthropic', modelId: 'claude-opus-4-8' })
  })

  it('does not silently run another provider for an unavailable requested model', () => {
    const choice = chooseProviderAndModel({ openai: { defaultModel: 'gpt-4o' } }, 'claude-opus-4-8')
    expect(choice).toBeNull()
  })
})
