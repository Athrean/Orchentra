import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { executions, nodes } from '../db/schema'

export const executionSelectSchema = createSelectSchema(executions)
export const executionInsertSchema = createInsertSchema(executions)
export const nodeSelectSchema = createSelectSchema(nodes)
export const nodeInsertSchema = createInsertSchema(nodes)

export const executionKindSchema = z.enum(['ci_failure', 'cron', 'manual'])
export const executionStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed'])

export const executionFilterSchema = z.object({
  repoId: z.string().uuid().optional(),
  kind: executionKindSchema.optional(),
  status: executionStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().datetime().optional(),
})

export type ExecutionFilter = z.infer<typeof executionFilterSchema>
