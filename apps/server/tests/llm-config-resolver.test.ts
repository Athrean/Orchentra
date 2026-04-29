import { afterEach, describe, test, expect, mock } from 'bun:test'

let getOrgLlmConfigImpl: ((orgId: string) => Promise<unknown>) | null = null

mock.module('../src/llm-config/queries', () => ({
  SUPPORTED_PROVIDERS: ['openrouter', 'anthropic', 'openai', 'custom'] as const,
  getOrgLlmConfig: async (orgId: string) => (getOrgLlmConfigImpl ? await getOrgLlmConfigImpl(orgId) : null),
}))

mock.module('../src/config', () => ({
  config: {
    github: { token: 't', webhook_secret: 's', repos: [] },
    llm: { api_key: 'sk-env', model: 'anthropic/env-model', embedding_model: 'text-embedding-3-small' },
  },
}))

const { resolveLlmConfig } = await import('../src/agent/llm')

afterEach(() => {
  getOrgLlmConfigImpl = null
})

describe('resolveLlmConfig', () => {
  test('returns env-based config when no orgId is provided', async () => {
    const cfg = await resolveLlmConfig()
    expect(cfg.provider).toBe('openrouter')
    expect(cfg.modelId).toBe('anthropic/env-model')
    expect(cfg.apiKey).toBe('sk-env')
    expect(cfg.baseUrl).toBeNull()
  })

  test('returns env-based config when orgId has no row', async () => {
    getOrgLlmConfigImpl = async () => null
    const cfg = await resolveLlmConfig('org-1')
    expect(cfg.modelId).toBe('anthropic/env-model')
    expect(cfg.apiKey).toBe('sk-env')
  })

  test('returns org-scoped config when present', async () => {
    getOrgLlmConfigImpl = async () => ({
      provider: 'anthropic' as const,
      modelId: 'claude-haiku-4-5',
      apiKey: 'sk-org',
      baseUrl: null,
    })
    const cfg = await resolveLlmConfig('org-1')
    expect(cfg.provider).toBe('anthropic')
    expect(cfg.modelId).toBe('claude-haiku-4-5')
    expect(cfg.apiKey).toBe('sk-org')
  })
})
