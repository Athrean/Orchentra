import { z } from 'zod'

export interface IncidentContext {
  id: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  workflowRunId: number
  failedStep: string | null
  triggeredAt: Date
  rawPayload: Record<string, unknown>
}

export interface DataFragment {
  source: string
  summary: string
  raw: Record<string, unknown>
  relevanceSignals: string[]
}

export interface Integration {
  id: string
  name: string
  category: 'ci' | 'observability' | 'alerting' | 'cloud' | 'comms'
  relevance(_ctx: IncidentContext): Promise<number>
  fetch(_ctx: IncidentContext): Promise<DataFragment>
  credentialSchema: z.ZodSchema
}

export const BriefSchema = z.object({
  failureType: z.enum(['flaky_test', 'env_missing', 'dependency_conflict', 'infra_timeout', 'code_bug', 'unknown']),
  summary: z.string(),
  rootCause: z.string(),
  suggestedFix: z.string(),
  confidence: z.number().min(0).max(1),
  similarIncidentId: z.string().nullable().optional(),
})

export type IncidentBrief = z.infer<typeof BriefSchema>

export type IncidentStatus = 'investigating' | 'brief_ready' | 'fixing' | 'resolved' | 'snoozed' | 'dismissed'
