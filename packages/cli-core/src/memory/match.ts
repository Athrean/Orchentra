import type { EmbeddingVector, MemoryConfig, MemoryStore, PatternMatch } from './types'
import { cosineSimilarity, SIMILARITY_THRESHOLD } from './similarity'

export type EmbedFn = (text: string, config: MemoryConfig) => Promise<EmbeddingVector>

export async function findSimilarPatterns(
  store: MemoryStore,
  embedFn: EmbedFn,
  config: MemoryConfig,
  text: string,
  orgId: string,
  limit: number = config.maxResults,
): Promise<PatternMatch[]> {
  const queryVec = await embedFn(text, config)
  const allPatterns = store.load(orgId)
  if (allPatterns.length === 0) return []

  const matches: PatternMatch[] = []
  for (const entry of allPatterns) {
    const entryVec = entry.embedding as unknown as EmbeddingVector
    const score = cosineSimilarity(queryVec, entryVec)
    if (score >= (config.similarityThreshold ?? SIMILARITY_THRESHOLD)) {
      matches.push({ entry, similarity: score })
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity)
  const results = matches.slice(0, limit)

  for (const m of results) {
    store.updateUsage(orgId, m.entry.id)
  }

  return results
}
