import { z } from 'zod'
import type { Operation } from '../../types'
import { getBrainAdapter, type EpisodeRow } from './adapter'

const parameters = z.object({
  orgId: z.string().min(1).optional().describe('Restrict results to a single org.'),
  kind: z
    .string()
    .min(1)
    .optional()
    .describe('Restrict results to episodes whose kind matches (mirrors executions.kind).'),
  since: z.string().optional().describe('ISO 8601 timestamp lower bound. Episodes created before this are excluded.'),
  limit: z.number().int().positive().max(500).optional().describe('Hard cap on rows. Adapter chooses a default.'),
})

type Params = z.infer<typeof parameters>

interface Result {
  episodes: EpisodeRow[]
}

export const listEpisodesOperation: Operation<Params, Result> = {
  id: 'list_episodes',
  description:
    'List recorded episodes, optionally filtered by org, kind, or a "since" timestamp. Read-scoped; safe for remote callers.',
  scope: 'read',
  mutating: false,
  localOnly: false,
  parameters,
  cliHints: { name: 'list_episodes' },
  handler: async (_ctx, params) => {
    const adapter = getBrainAdapter()
    const episodes = await adapter.listEpisodes({
      orgId: params.orgId,
      kind: params.kind,
      since: params.since,
      limit: params.limit,
    })
    return { episodes }
  },
}
