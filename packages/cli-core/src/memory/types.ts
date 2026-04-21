export type FailureType =
  | 'flaky_test'
  | 'env_missing'
  | 'dependency_conflict'
  | 'infra_timeout'
  | 'code_bug'
  | 'unknown'

export interface EmbeddingVector {
  readonly __brand: unique symbol
  readonly data: readonly number[]
}

export interface PatternEntry {
  id: string
  orgId: string
  incidentId: string | null
  embedding: number[]
  pattern: string
  resolution: string
  failureType: FailureType
  usageCount: number
  lastMatchedAt: string | null
  createdAt: string
}

export interface PatternMatch {
  entry: PatternEntry
  similarity: number
}

export interface MemoryConfig {
  embeddingModel: string
  embeddingBaseUrl: string
  similarityThreshold: number
  maxResults: number
}

export interface PatternBuilderInput {
  workflowName: string
  branch: string
  rootCause: string
  summary?: string
  failureType?: FailureType
}

export interface MemoryStore {
  save(orgId: string, entry: PatternEntry): void
  load(orgId: string): PatternEntry[]
  updateUsage(orgId: string, entryId: string): void
  delete(orgId: string, entryId: string): void
  has(orgId: string, incidentId: string): boolean
}
