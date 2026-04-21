export type {
  EmbeddingVector,
  FailureType,
  MemoryConfig,
  MemoryStore,
  PatternBuilderInput,
  PatternEntry,
  PatternMatch,
} from './types'

export { buildPatternText, buildResolutionText, FAILURE_TYPES } from './builder'
export { cosineSimilarity, SIMILARITY_THRESHOLD } from './similarity'
export { embedText } from './embed'
export { PatternStore } from './store'
export { findSimilarPatterns } from './match'
export type { EmbedFn } from './match'
export { formatPatternContext } from './format'
