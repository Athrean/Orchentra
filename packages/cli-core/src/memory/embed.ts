import type { EmbeddingVector, MemoryConfig } from './types'

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>
}

export async function embedText(text: string, config: MemoryConfig): Promise<EmbeddingVector> {
  if (!config.embeddingBaseUrl || config.embeddingBaseUrl.trim().length === 0) {
    throw new Error('Memory embedding base URL is not configured')
  }
  const base = config.embeddingBaseUrl.replace(/\/+$/, '')
  const url = `${base}/embeddings`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.embeddingApiKey && config.embeddingApiKey.trim().length > 0) {
    headers.Authorization = `Bearer ${config.embeddingApiKey.trim()}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: config.embeddingModel, input: text }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Embedding request failed: ${response.status} ${response.statusText}`)
    }

    const json = (await response.json()) as EmbeddingResponse
    const embedding = json.data?.[0]?.embedding
    if (!embedding || embedding.length === 0) {
      throw new Error('No embedding returned from API')
    }

    return embedding
  } finally {
    clearTimeout(timeout)
  }
}
