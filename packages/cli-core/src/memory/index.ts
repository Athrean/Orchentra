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
export { failureSignature, normalizeFailureLog, redactSecrets } from './failure-signature'
export type { FailureSignature, FailureSignatureInput } from './failure-signature'
export { cosineSimilarity, SIMILARITY_THRESHOLD } from './similarity'
export { embedText } from './embed'
export { PatternStore } from './store'
export { findSimilarPatterns } from './match'
export { formatPatternContext } from './format'
export { prepareMemoryContext, recordResolvedPattern } from './service'
export type { MemoryDeps, PreparedMemoryContext, RecordPatternInput, RecordPatternResult } from './service'
