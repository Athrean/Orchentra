import { randomUUID } from 'node:crypto'
import { buildPatternText, buildResolutionText } from './builder'
import { findSimilarPatterns } from './match'
import { formatPatternContext } from './format'
import type { EmbedFn, MemoryConfig, MemoryStore, PatternBuilderInput, PatternEntry, PatternMatch } from './types'

export interface MemoryDeps {
  store: MemoryStore
  embed: EmbedFn
  config: MemoryConfig
}

export interface PreparedMemoryContext {
  text: string
  matches: PatternMatch[]
}

export async function prepareMemoryContext(
  deps: MemoryDeps,
  orgId: string,
  query: string,
): Promise<PreparedMemoryContext> {
  const matches = await findSimilarPatterns(deps.store, deps.embed, deps.config, query, orgId)
  return { text: formatPatternContext(matches), matches }
}

export interface RecordPatternInput extends PatternBuilderInput {
  orgId: string
  incidentId: string
  suggestedFix?: string
}

export interface RecordPatternResult {
  saved: boolean
  entry: PatternEntry | null
}

export async function recordResolvedPattern(
  deps: MemoryDeps,
  input: RecordPatternInput,
  now: () => Date = () => new Date(),
): Promise<RecordPatternResult> {
  if (deps.store.has(input.orgId, input.incidentId)) {
    return { saved: false, entry: null }
  }

  const patternText = buildPatternText(input)
  const resolutionText = buildResolutionText(input.suggestedFix)
  const embedding = await deps.embed(patternText, deps.config)

  const entry: PatternEntry = {
    id: randomUUID(),
    orgId: input.orgId,
    incidentId: input.incidentId,
    embedding,
    pattern: patternText,
    resolution: resolutionText,
    failureType: input.failureType ?? 'unknown',
    usageCount: 0,
    lastMatchedAt: null,
    createdAt: now().toISOString(),
  }

  deps.store.save(input.orgId, entry)
  return { saved: true, entry }
}
