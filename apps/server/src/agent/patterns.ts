import { embed, cosineSimilarity } from 'ai'
import { eq } from 'drizzle-orm'
import { db, incidents, resolvedPatterns } from '../db/client'
import { createEmbeddingModel } from './llm'
import type { IncidentBrief } from '@orchentra/core'

const SIMILARITY_THRESHOLD = 0.78
const DEFAULT_LIMIT = 3

interface PatternMatch {
  id: string
  incidentId: string | null
  pattern: string | null
  resolution: string | null
  failureType: string | null
  similarity: number
}

function buildPatternText(incident: {
  workflowName: string
  branch: string
  rootCause: string | null
  suggestedFix: string | null
  briefJson: string | null
}): string {
  let brief: IncidentBrief | null = null
  if (incident.briefJson) {
    try {
      brief = JSON.parse(incident.briefJson) as IncidentBrief
    } catch {
      // ignore parse errors
    }
  }

  return [
    `workflow: ${incident.workflowName}`,
    `branch: ${incident.branch}`,
    `root_cause: ${incident.rootCause ?? 'unknown'}`,
    brief?.summary ? `summary: ${brief.summary}` : null,
    brief?.failureType ? `failure_type: ${brief.failureType}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildResolutionText(incident: { suggestedFix: string | null; briefJson: string | null }): string {
  let brief: IncidentBrief | null = null
  if (incident.briefJson) {
    try {
      brief = JSON.parse(incident.briefJson) as IncidentBrief
    } catch {
      // ignore parse errors
    }
  }

  return incident.suggestedFix ?? brief?.suggestedFix ?? 'No resolution recorded'
}

export async function saveResolvedPattern(incidentId: string): Promise<void> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })

  if (!incident) return
  if (!incident.rootCause && !incident.briefJson) return

  // Check if pattern already exists for this incident
  const existing = await db.query.resolvedPatterns.findFirst({
    where: eq(resolvedPatterns.incidentId, incidentId),
  })
  if (existing) return

  const patternText = buildPatternText(incident)
  const resolutionText = buildResolutionText(incident)

  let brief: IncidentBrief | null = null
  if (incident.briefJson) {
    try {
      brief = JSON.parse(incident.briefJson) as IncidentBrief
    } catch {
      // ignore
    }
  }

  const { embedding } = await embed({
    model: createEmbeddingModel(),
    value: patternText,
  })

  await db.insert(resolvedPatterns).values({
    id: crypto.randomUUID(),
    incidentId,
    embedding: JSON.stringify(embedding),
    pattern: patternText,
    resolution: resolutionText,
    failureType: brief?.failureType ?? null,
    usageCount: 0,
  })
}

export async function findSimilarPatterns(
  incidentText: string,
  limit: number = DEFAULT_LIMIT,
): Promise<PatternMatch[]> {
  const allPatterns = await db.query.resolvedPatterns.findMany()
  if (allPatterns.length === 0) return []

  const { embedding: queryEmbedding } = await embed({
    model: createEmbeddingModel(),
    value: incidentText,
  })

  const scored: PatternMatch[] = []

  for (const pattern of allPatterns) {
    if (!pattern.embedding) continue

    let storedEmbedding: number[]
    try {
      storedEmbedding = JSON.parse(pattern.embedding) as number[]
    } catch {
      continue
    }

    if (storedEmbedding.length !== queryEmbedding.length) continue

    const similarity = cosineSimilarity(queryEmbedding, storedEmbedding)

    if (similarity >= SIMILARITY_THRESHOLD) {
      scored.push({
        id: pattern.id,
        incidentId: pattern.incidentId,
        pattern: pattern.pattern,
        resolution: pattern.resolution,
        failureType: pattern.failureType,
        similarity,
      })
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity)
  const topMatches = scored.slice(0, limit)

  // Update usage counts for matched patterns
  for (const match of topMatches) {
    await db
      .update(resolvedPatterns)
      .set({
        usageCount: (allPatterns.find((p) => p.id === match.id)?.usageCount ?? 0) + 1,
        lastMatchedAt: new Date(),
      })
      .where(eq(resolvedPatterns.id, match.id))
  }

  return topMatches
}

export function formatPatternContext(matches: PatternMatch[]): string {
  if (matches.length === 0) return ''

  const lines = ['## Similar Past Incidents', '']

  for (const match of matches) {
    const pct = Math.round(match.similarity * 100)
    lines.push(`### Match (${pct}% similar)`)
    lines.push(`**Failure pattern:** ${match.pattern ?? 'unknown'}`)
    lines.push(`**Resolution:** ${match.resolution ?? 'unknown'}`)
    lines.push(`**Failure type:** ${match.failureType ?? 'unknown'}`)
    lines.push('')
  }

  lines.push(
    'Use these past resolutions to inform your analysis. If the current failure matches a past pattern, reference it and adjust your confidence upward.',
  )

  return lines.join('\n')
}
