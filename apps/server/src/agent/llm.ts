import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { EmbeddingModel, LanguageModelV1 } from 'ai'
import { config } from '../config'

/**
 * Creates a model from orchentra.yml config.
 *
 * - No base_url → OpenRouter (frontier models from many providers)
 * - With base_url → OpenAI-compatible endpoint (zai, LiteLLM, Ollama, etc.)
 */
export function createModel(modelOverride?: string): LanguageModelV1 {
  const { api_key: apiKey, model, base_url: baseUrl } = config.llm
  const modelId = modelOverride ?? model

  if (baseUrl) {
    const provider = createOpenAICompatible({
      name: 'custom',
      apiKey,
      baseURL: baseUrl,
    })
    return provider(modelId)
  }

  const provider = createOpenRouter({ apiKey })
  return provider(modelId)
}

/** Check if the configured model routes to Anthropic (for prompt caching support). */
export function isAnthropicModel(): boolean {
  const modelId = config.llm.model
  return modelId.startsWith('anthropic/') || modelId.startsWith('claude-')
}

/** Provider options for Anthropic prompt caching (5-min ephemeral TTL).
 *  Attach to a system message via `providerOptions: ANTHROPIC_CACHE_OPTIONS`. */
export const ANTHROPIC_CACHE_OPTIONS = {
  anthropic: { cacheControl: { type: 'ephemeral' as const } },
}

/**
 * Creates an embedding model via OpenAI-compatible endpoint.
 *
 * - With base_url → custom endpoint (zai proxy, etc.)
 * - No base_url → OpenRouter (supports OpenAI embedding models at same pricing)
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
