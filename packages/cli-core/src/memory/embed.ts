import type { EmbeddingVector, MemoryConfig } from './types'

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>
}

export async function embedText(text: string, config: MemoryConfig): Promise<EmbeddingVector> {
  const url = `${config.embeddingBaseUrl}/embeddings`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.embeddingModel, input: text }),
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
}
