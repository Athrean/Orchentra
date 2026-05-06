import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  pullNumber: z.number().int().positive().describe('Pull request number to merge.'),
  commitTitle: z.string().optional().describe('Title for the merge commit (used for merge/squash).'),
  commitMessage: z.string().optional().describe('Extra detail for the merge commit body.'),
  mergeMethod: z
    .enum(['merge', 'squash', 'rebase'])
    .optional()
    .describe("Merge strategy: 'merge', 'squash', or 'rebase'. Defaults to 'merge'."),
})

type Params = z.infer<typeof parameters>

export interface MergePullRequestResult {
  sha: string
  merged: boolean
  message: string
}

export interface MergePullRequestError {
  error: string
}

export const mergePullRequestOperation: Operation<Params, MergePullRequestResult | MergePullRequestError> = {
  id: 'merge_pull_request',
  description:
    'Merge an open pull request in a GitHub repository. ' +
    'This is a destructive write — the PR will be merged and cannot be undone via this operation. ' +
    'Requires approval before execution. The repository must be monitored.',
  scope: 'write',
  trustClass: 'destructive',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'merge_pull_request' },
  handler: async (_ctx, { owner, repo, pullNumber, commitTitle, commitMessage, mergeMethod }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        commit_title: commitTitle,
        commit_message: commitMessage,
        merge_method: mergeMethod ?? 'merge',
      })
      return {
        sha: data.sha,
        merged: data.merged,
        message: data.message,
      }
    } catch (err) {
      return {
        error: `Failed to merge pull request: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
