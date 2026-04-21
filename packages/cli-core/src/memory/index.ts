export type {
  EmbedFn,
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
export { PatternStore, PatternStoreError } from './store'
export { findSimilarPatterns } from './match'
export { formatPatternContext } from './format'
export { prepareMemoryContext, recordResolvedPattern } from './service'
export type { MemoryDeps, PreparedMemoryContext, RecordPatternInput, RecordPatternResult } from './service'
