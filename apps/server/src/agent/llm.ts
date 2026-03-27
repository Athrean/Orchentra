import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { EmbeddingModelV1, LanguageModelV1 } from 'ai'
import { config } from '../config'

/**
 * Creates a model from orchentra.yml config.
 *
 * - No base_url → OpenRouter (all frontier models: Claude, GPT, Gemini, etc.)
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

/**
 * Creates an embedding model via OpenAI-compatible endpoint.
 *
 * - With base_url → custom endpoint (zai proxy, etc.)
 * - No base_url → OpenRouter (supports OpenAI embedding models at same pricing)
 */
export function createEmbeddingModel(modelOverride?: string): EmbeddingModelV1<string> {
  const { api_key: apiKey, embedding_model: embeddingModel, base_url: baseUrl } = config.llm
  const modelId = modelOverride ?? embeddingModel

  const provider = createOpenAICompatible({
    name: 'embeddings',
    apiKey,
    baseURL: baseUrl ?? 'https://openrouter.ai/api/v1',
  })

  return provider.textEmbeddingModel(modelId)
}
