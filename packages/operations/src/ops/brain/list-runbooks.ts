import { z } from 'zod'
import type { Operation } from '../../types'
import { getBrainAdapter, type RunbookRow } from './adapter'

const parameters = z.object({
  orgId: z.string().min(1).optional().describe('Restrict results to a single org.'),
  name: z.string().min(1).optional().describe('Restrict results to runbooks with this name.'),
  limit: z.number().int().positive().max(500).optional().describe('Hard cap on rows.'),
})

type Params = z.infer<typeof parameters>

interface Result {
  runbooks: RunbookRow[]
}

export const listRunbooksOperation: Operation<Params, Result> = {
  id: 'list_runbooks',
  description: 'List runbooks, optionally filtered by org or name. Read-scoped; safe for remote callers.',
  scope: 'read',
  mutating: false,
  localOnly: false,
  parameters,
  cliHints: { name: 'list_runbooks' },
  handler: async (_ctx, params) => {
    const adapter = getBrainAdapter()
    const runbooks = await adapter.listRunbooks({
      orgId: params.orgId,
      name: params.name,
      limit: params.limit,
    })
    return { runbooks }
  },
}
