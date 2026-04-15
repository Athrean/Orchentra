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

const RepoRelativePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.startsWith('\\'), { message: 'Path must be repo-relative' })
  .refine((p) => !/^[A-Za-z]:[\\/]/.test(p), { message: 'Path must not be absolute' })
  .refine((p) => p.split(/[\\/]+/).every((seg) => seg !== '' && seg !== '.' && seg !== '..'), {
    message: 'Path must not contain traversal segments',
  })

export const FilePatchSchema = z.discriminatedUnion('action', [
  z.object({ path: RepoRelativePath, action: z.literal('modify'), content: z.string().min(1) }),
  z.object({ path: RepoRelativePath, action: z.literal('create'), content: z.string().min(1) }),
  z.object({ path: RepoRelativePath, action: z.literal('delete') }),
])

export const PatchSetSchema = z.object({
  patches: z.array(FilePatchSchema).max(10),
})

export type FilePatch = z.infer<typeof FilePatchSchema>
export type PatchSet = z.infer<typeof PatchSetSchema>
