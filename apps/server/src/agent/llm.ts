import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { EmbeddingModel, LanguageModelV1 } from 'ai'
import { config } from '../config'
import { getOrgLlmConfig, type LlmProvider, type ResolvedLlmConfig } from '../llm-config/queries'

/**
 * Resolve the effective LLM config for a given org, with env fallback.
 * Pure function modulo the DB read — exported for tests.
 */
export async function resolveLlmConfig(orgId?: string | null): Promise<ResolvedLlmConfig> {
  if (orgId) {
    const orgCfg = await getOrgLlmConfig(orgId)
    if (orgCfg) return orgCfg
  }
  const fallbackProvider: LlmProvider = config.llm.base_url ? 'custom' : 'openrouter'
  return {
    provider: fallbackProvider,
    modelId: config.llm.model,
    apiKey: config.llm.api_key,
    baseUrl: config.llm.base_url ?? null,
  }
}

function buildModel(cfg: ResolvedLlmConfig, modelOverride?: string): LanguageModelV1 {
  const modelId = modelOverride ?? cfg.modelId
  const apiKey = cfg.apiKey ?? ''

  switch (cfg.provider) {
    case 'anthropic': {
      const provider = createAnthropic({ apiKey, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}) })
      return provider(modelId)
    }
    case 'openai': {
      const provider = createOpenAI({ apiKey, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}) })
      return provider(modelId)
    }
    case 'custom': {
      const baseURL = cfg.baseUrl ?? 'https://openrouter.ai/api/v1'
      const provider = createOpenAICompatible({ name: 'custom', apiKey, baseURL })
      return provider(modelId)
    }
    case 'openrouter':
    default: {
      const provider = createOpenRouter({ apiKey })
      return provider(modelId)
    }
  }
}

/**
 * Backwards-compatible synchronous factory using the env-based config.
 * Prefer `createModelForOrg(orgId)` when an org id is in scope.
 */
export function createModel(modelOverride?: string): LanguageModelV1 {
  const fallbackProvider: LlmProvider = config.llm.base_url ? 'custom' : 'openrouter'
  return buildModel(
    {
      provider: fallbackProvider,
      modelId: config.llm.model,
      apiKey: config.llm.api_key,
      baseUrl: config.llm.base_url ?? null,
    },
    modelOverride,
  )
}

/** Resolve org config (if any) and build the matching LanguageModelV1. */
export async function createModelForOrg(orgId?: string | null, modelOverride?: string): Promise<LanguageModelV1> {
  const cfg = await resolveLlmConfig(orgId)
  return buildModel(cfg, modelOverride)
}

export function isAnthropicModel(modelId: string = config.llm.model): boolean {
  return modelId.startsWith('anthropic/') || modelId.startsWith('claude-')
}

/** Provider options for Anthropic prompt caching (5-min ephemeral TTL).
 *  Attach to a system message via `providerOptions: ANTHROPIC_CACHE_OPTIONS`. */
export const ANTHROPIC_CACHE_OPTIONS = {
  anthropic: { cacheControl: { type: 'ephemeral' as const } },
}

/**
 * Creates an embedding model via OpenAI-compatible endpoint.
 * Embeddings stay on the env-configured provider since per-org embedding
 * routing isn't part of #62 scope (embeddings index lives server-side).
 */
export function createEmbeddingModel(modelOverride?: string): EmbeddingModel<string> {
  const { api_key: apiKey, embedding_model: embeddingModel, base_url: baseUrl } = config.llm
  const modelId = modelOverride ?? embeddingModel

  const provider = createOpenAICompatible({
    name: 'embeddings',
    apiKey,
    baseURL: baseUrl ?? 'https://openrouter.ai/api/v1',
  })

  return provider.textEmbeddingModel(modelId)
}
