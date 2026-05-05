import { z } from 'zod'
import type { Operation } from '../../types'
import { OperationError } from '../../types'
import { getBrainAdapter, type RunbookRow } from './adapter'

const parameters = z.object({
  id: z.string().min(1).describe('Runbook id to fetch.'),
})

type Params = z.infer<typeof parameters>

interface Result {
  runbook: RunbookRow
}

export const getRunbookOperation: Operation<Params, Result> = {
  id: 'get_runbook',
  description: 'Fetch a single runbook by id, including its Markdown body, triggers, and ops list.',
  scope: 'read',
  mutating: false,
  localOnly: false,
  parameters,
  cliHints: { name: 'get_runbook' },
  handler: async (_ctx, params) => {
    const adapter = getBrainAdapter()
    const runbook = await adapter.getRunbook(params.id)
    if (!runbook) {
      throw new OperationError({ code: 'not_found', message: `runbook ${params.id} not found` })
    }
    return { runbook }
  },
}
