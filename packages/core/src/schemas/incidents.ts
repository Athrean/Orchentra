import { z } from 'zod'

export const IncidentStatusSchema = z.enum([
  'investigating',
  'brief_ready',
  'fixing',
  'resolved',
  'snoozed',
  'dismissed',
  'escalated',
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
  githubIssueUrl: z.string().nullable(),
  githubPrUrl: z.string().nullable(),
  snoozedUntil: z.coerce.date().nullable(),
  escalatedAt: z.coerce.date().nullable(),
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

export const UpdateIncidentStatusSchema = z
  .object({
    status: IncidentStatusSchema.extract(['resolved', 'snoozed', 'dismissed']),
    snoozedUntil: z.coerce.date().optional(),
  })
  .refine((data) => data.status !== 'snoozed' || data.snoozedUntil !== undefined, {
    message: 'snoozedUntil is required when status is snoozed',
    path: ['snoozedUntil'],
  })

export type UpdateIncidentStatusRequest = z.infer<typeof UpdateIncidentStatusSchema>

export const IncidentActionSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  actionType: z.string(),
  performedBy: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.coerce.date(),
})

export type IncidentAction = z.infer<typeof IncidentActionSchema>

export const IncidentDetailResponseSchema = z.object({
  incident: IncidentDetailSchema,
  toolCalls: z.array(ToolCallSchema),
  actions: z.array(IncidentActionSchema),
})

export type IncidentDetailResponse = z.infer<typeof IncidentDetailResponseSchema>

// --- Execution graph primitives ---
//
// Phase 1 of the graph repositioning. Executions are the root unit (one per
// trigger); nodes are children (currently tool_call kind, future: decision,
// human_review, patch, rollback). The aliases below let consumers adopt the
// new names ahead of the schema-rename cleanup pass without churn.

export const ExecutionKindSchema = z.enum(['ci_failure', 'cron'])
export type ExecutionKind = z.infer<typeof ExecutionKindSchema>

export const NodeKindSchema = z.enum(['tool_call'])
export type NodeKind = z.infer<typeof NodeKindSchema>

export const ExecutionStatusSchema = IncidentStatusSchema
export type ExecutionStatus = IncidentStatus

/** Same shape as `IncidentListItem` — kept as an alias so callers can adopt the
 * graph-shaped name without waiting for the full rename pass. */
export type ExecutionListItem = IncidentListItem
export const ExecutionListItemSchema = IncidentListItemSchema

export type ExecutionDetail = IncidentDetail
export const ExecutionDetailSchema = IncidentDetailSchema

/** Same shape as `ToolCall` — alias for the graph rename. */
export const NodeSchema = ToolCallSchema
