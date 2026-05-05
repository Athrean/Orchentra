import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const MAX_COMMENTS = 10
const MAX_BODY_CHARS = 3000

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  number: z.number().describe('Pull request number'),
})

type Params = z.infer<typeof parameters>

export const getPullRequestOperation: Operation<Params, unknown> = {
  id: 'get_pull_request',
  description:
    'Fetch details of a GitHub pull request including title, body, files changed, and review comments. ' +
    'Useful when a CI failure might be related to a recent PR or when reviewing the fix PR.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'get_pull_request' },
  handler: async (_ctx, { owner, repo, number: prNumber }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const adapter = getGithubAdapter()
      const [prResult, filesResult, commentsResult] = await Promise.all([
        adapter.pulls.get({ owner, repo, pull_number: prNumber }),
        adapter.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 20 }),
        adapter.pulls.listReviewComments({
          owner,
          repo,
          pull_number: prNumber,
          per_page: MAX_COMMENTS,
        }),
      ])

      const pr = prResult.data
      const truncatedBody = pr.body ? pr.body.slice(0, MAX_BODY_CHARS) : null

      const files = filesResult.data.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      }))

      const comments = commentsResult.data.map((c) => ({
        user: c.user?.login,
        body: c.body?.slice(0, 500),
      }))

      return {
        title: pr.title,
        body: truncatedBody,
        state: pr.state,
        merged: pr.merged,
        user: pr.user?.login,
        base: pr.base.ref,
        head: pr.head.ref,
        files,
        comments,
        createdAt: pr.created_at,
      }
    } catch (err) {
      return { error: `Failed to fetch PR: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
