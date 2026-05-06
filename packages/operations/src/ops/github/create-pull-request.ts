import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  title: z.string().describe('Pull request title.'),
  head: z.string().describe('Branch containing the changes.'),
  base: z.string().describe('Target branch to merge into.'),
  body: z.string().optional().describe('Pull request body in Markdown.'),
  draft: z.boolean().optional().describe('Open as a draft pull request.'),
})

type Params = z.infer<typeof parameters>

export interface CreatePullRequestResult {
  number: number
  url: string
}

export interface CreatePullRequestError {
  error: string
}

export const createPullRequestOperation: Operation<Params, CreatePullRequestResult | CreatePullRequestError> = {
  id: 'create_pull_request',
  description: 'Open a new pull request in a monitored repository. ' + 'Returns the PR number and URL on success.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'create_pull_request' },
  handler: async (_ctx, params) => {
    const fullName = `${params.owner}/${params.repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().pulls.create({
        owner: params.owner,
        repo: params.repo,
        title: params.title,
        head: params.head,
        base: params.base,
        body: params.body,
        draft: params.draft,
      })
      return { number: data.number, url: data.html_url }
    } catch (err) {
      return { error: `Failed to create pull request: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
