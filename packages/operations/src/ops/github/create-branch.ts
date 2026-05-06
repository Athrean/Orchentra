import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  branch: z.string().describe('New branch name (will be submitted as refs/heads/<branch>).'),
  sha: z.string().describe('Commit SHA to branch from.'),
})

type Params = z.infer<typeof parameters>

export interface CreateBranchResult {
  ref: string
  sha: string
}

export interface CreateBranchError {
  error: string
}

export const createBranchOperation: Operation<Params, CreateBranchResult | CreateBranchError> = {
  id: 'create_branch',
  description:
    'Create a new branch in a GitHub repository from a given commit SHA. ' +
    'The new ref is submitted as refs/heads/<branch>. ' +
    'The repository must be monitored.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'create_branch' },
  handler: async (_ctx, { owner, repo, branch, sha }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha,
      })
      return {
        ref: data.ref,
        sha: data.object.sha,
      }
    } catch (err) {
      return {
        error: `Failed to create branch: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
