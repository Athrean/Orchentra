import type { EmbedFn, MemoryConfig, MemoryStore, PatternMatch } from './types'
import { cosineSimilarity, SIMILARITY_THRESHOLD } from './similarity'

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
    if (entry.feedback === 'rejected') continue
    const score = cosineSimilarity(queryVec, entry.embedding)
    if (score >= (config.similarityThreshold ?? SIMILARITY_THRESHOLD)) {
      matches.push({ entry, similarity: score })
    }
  }

  matches.sort((a, b) => rankScore(b) - rankScore(a))
  const results = matches.slice(0, limit)

  store.updateUsageBatch(
    orgId,
    results.map((m) => m.entry.id),
  )

  return results
}

function rankScore(match: PatternMatch): number {
  return match.similarity + (match.entry.feedback === 'accepted' ? 0.05 : 0)
}
