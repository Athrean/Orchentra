import { z } from 'zod'

export const IncidentStatusSchema = z.enum([
  'investigating',
  'brief_ready',
  'fixing',
  'resolved',
  'snoozed',
  'dismissed',
  'error',
])

export type IncidentStatus = z.infer<typeof IncidentStatusSchema>

export const IncidentListItemSchema = z.object({
  id: z.string(),
  repo: z.string(),
  branch: z.string(),
  commit: z.string(),
  workflowName: z.string(),
  workflowRunId: z.number().nullable(),
  failedStep: z.string().nullable(),
  status: IncidentStatusSchema,
  confidence: z.number().nullable(),
  rootCause: z.string().nullable(),
  triggeredAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export type IncidentListItem = z.infer<typeof IncidentListItemSchema>

export const IncidentListResponseSchema = z.object({
  incidents: z.array(IncidentListItemSchema),
  total: z.number(),
})

export type IncidentListResponse = z.infer<typeof IncidentListResponseSchema>

export const IncidentDetailSchema = IncidentListItemSchema.extend({
  briefJson: z.string().nullable(),
  suggestedFix: z.string().nullable(),
  slackChannel: z.string().nullable(),
  slackMessageTs: z.string().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  mttrSeconds: z.number().nullable(),
})

export type IncidentDetail = z.infer<typeof IncidentDetailSchema>

export const ToolCallSchema = z.object({
  id: z.string(),
  integration: z.string(),
  round: z.number(),
  durationMs: z.number().nullable(),
  createdAt: z.coerce.date(),
})

export const IncidentDetailResponseSchema = z.object({
  incident: IncidentDetailSchema,
  toolCalls: z.array(ToolCallSchema),
})

export type IncidentDetailResponse = z.infer<typeof IncidentDetailResponseSchema>

export const UpdateIncidentStatusSchema = z.object({
  status: z.enum(['resolved', 'snoozed', 'dismissed']),
})

export type UpdateIncidentStatusRequest = z.infer<typeof UpdateIncidentStatusSchema>
