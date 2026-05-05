import { z } from 'zod'
import type { Operation } from '../../types'
import { getBrainAdapter, type EpisodeRow } from './adapter'

const parameters = z.object({
  orgId: z.string().min(1).describe('Org that owns the episode.'),
  executionId: z.string().min(1).describe('Execution this episode summarises.'),
  kind: z.string().min(1).describe('Mirror of executions.kind so episodes can be filtered without a join.'),
  summary: z.string().min(1).describe('Short, human-readable summary of what the run did.'),
  opsCalled: z.array(z.string()).optional().describe('Flat list of operation ids the run invoked. Order is preserved.'),
  outcome: z
    .enum(['success', 'failure', 'unknown'])
    .optional()
    .describe('Run outcome from the caller’s perspective. Defaults to "unknown".'),
})

type Params = z.infer<typeof parameters>

function newId(): string {
  // Use crypto.randomUUID — available in Bun, Node 19+, and modern browsers.
  // Inlined here so the operations package keeps zero non-zod dependencies.
  return `ep_${crypto.randomUUID()}`
}

export const recordEpisodeOperation: Operation<Params, EpisodeRow> = {
  id: 'record_episode',
  description:
    'Append an episode (a structured "what happened" summary) to the brain. The caller posts the orgId, executionId, ' +
    'kind, summary, ops they invoked, and an outcome — the operation persists it. Write-scoped: fails closed when called ' +
    'by a remote caller without explicit local approval.',
  scope: 'write',
  mutating: true,
  localOnly: false,
  parameters,
  cliHints: { name: 'record_episode' },
  handler: async (_ctx, params) => {
    const adapter = getBrainAdapter()
    const row: EpisodeRow = {
      id: newId(),
      orgId: params.orgId,
      executionId: params.executionId,
      kind: params.kind,
      summary: params.summary,
      opsCalled: params.opsCalled ?? [],
      outcome: params.outcome ?? 'unknown',
      createdAt: new Date(),
    }
    return adapter.saveEpisode(row)
  },
}
