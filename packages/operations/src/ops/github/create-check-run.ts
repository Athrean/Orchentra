import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  name: z.string().describe('Name of the check run.'),
  headSha: z.string().describe('SHA of the commit to attach the check to.'),
  status: z.enum(['queued', 'in_progress', 'completed']).optional().describe('Check run status.'),
  conclusion: z.string().optional().describe("Conclusion when status is 'completed' (e.g. success, failure)."),
  detailsUrl: z.string().optional().describe('URL with full details for the check run.'),
})

type Params = z.infer<typeof parameters>

export interface CreateCheckRunResult {
  id: number
  url: string
}

export interface CreateCheckRunError {
  error: string
}

export const createCheckRunOperation: Operation<Params, CreateCheckRunResult | CreateCheckRunError> = {
  id: 'create_check_run',
  description:
    'Create a GitHub check run on a commit in a monitored repository. ' +
    'Returns the check run id and URL on success.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'create_check_run' },
  handler: async (_ctx, params) => {
    const fullName = `${params.owner}/${params.repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().checks.create({
        owner: params.owner,
        repo: params.repo,
        name: params.name,
        head_sha: params.headSha,
        status: params.status,
        conclusion: params.conclusion,
        details_url: params.detailsUrl,
      })
      return { id: data.id, url: data.html_url ?? '' }
    } catch (err) {
      return { error: `Failed to create check run: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
