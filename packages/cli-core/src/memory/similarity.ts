import type { EmbeddingVector } from './types'

export const SIMILARITY_THRESHOLD = 0.78

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  const av = a.data
  const bv = b.data
  if (av.length !== bv.length || av.length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < av.length; i++) {
    dot += av[i] * bv[i]
    normA += av[i] * av[i]
    normB += bv[i] * bv[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
