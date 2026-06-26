export type FailureType =
  | 'flaky_test'
  | 'env_missing'
  | 'dependency_conflict'
  | 'infra_timeout'
  | 'code_bug'
  | 'unknown'

export type EmbeddingVector = number[]
export type MemoryFeedback = 'accepted' | 'rejected'

export interface MemoryConfig {
  embeddingModel: string
  embeddingBaseUrl: string | undefined
  embeddingApiKey?: string
  similarityThreshold: number
  maxResults: number
}

export type EmbedFn = (text: string, config: MemoryConfig) => Promise<EmbeddingVector>

export interface PatternEntry {
  id: string
  orgId: string
  incidentId: string | null
  embedding: EmbeddingVector
  pattern: string
  resolution: string
  failureType: FailureType
  usageCount: number
  lastMatchedAt: string | null
  feedback?: MemoryFeedback
  feedbackAt?: string
  createdAt: string
}

export interface PatternMatch {
  entry: PatternEntry
  similarity: number
}

export interface PatternBuilderInput {
  workflowName: string
  branch: string
  rootCause: string
  summary?: string
  failureType?: FailureType
  jobName?: string
  stepName?: string
  /** Stable failure-signature hash, so the same failure class retrieves itself. */
  signatureHash?: string
}

export interface MemoryStore {
  save(orgId: string, entry: PatternEntry): void
  load(orgId: string): PatternEntry[]
  updateUsage(orgId: string, entryId: string): void
  updateUsageBatch(orgId: string, entryIds: string[]): void
  setFeedback?(orgId: string, entryId: string, feedback: MemoryFeedback, at?: Date): void
  delete(orgId: string, entryId: string): void
  has(orgId: string, incidentId: string): boolean
}
