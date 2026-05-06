import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  sha: z.string().describe('Full commit SHA.'),
  state: z.enum(['error', 'failure', 'pending', 'success']).describe('Commit status state.'),
  targetUrl: z.string().optional().describe('URL to link from the status.'),
  description: z.string().max(140).optional().describe('Short description (max 140 chars).'),
  context: z.string().optional().describe("Status context label (defaults to 'default')."),
})

type Params = z.infer<typeof parameters>

export interface CreateCommitStatusResult {
  id: number
  state: string
}

export interface CreateCommitStatusError {
  error: string
}

export const createCommitStatusOperation: Operation<Params, CreateCommitStatusResult | CreateCommitStatusError> = {
  id: 'create_commit_status',
  description:
    'Set a commit status on a commit in a monitored repository. ' + 'Returns the status id and state on success.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'create_commit_status' },
  handler: async (_ctx, params) => {
    const fullName = `${params.owner}/${params.repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().repos.createCommitStatus({
        owner: params.owner,
        repo: params.repo,
        sha: params.sha,
        state: params.state,
        target_url: params.targetUrl,
        description: params.description,
        context: params.context,
      })
      return { id: data.id, state: data.state }
    } catch (err) {
      return { error: `Failed to create commit status: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
