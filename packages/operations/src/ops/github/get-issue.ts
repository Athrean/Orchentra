import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const MAX_COMMENTS = 10
const MAX_BODY_CHARS = 3000

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  number: z.number().describe('Issue number'),
})

type Params = z.infer<typeof parameters>

export const getIssueOperation: Operation<Params, unknown> = {
  id: 'get_issue',
  description:
    'Fetch details of a GitHub issue including title, body, labels, and comments. ' +
    'Useful when a CI failure is linked to a known issue or when checking for related bug reports.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'get_issue' },
  handler: async (_ctx, { owner, repo, number: issueNumber }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const adapter = getGithubAdapter()
      const [issueResult, commentsResult] = await Promise.all([
        adapter.issues.get({ owner, repo, issue_number: issueNumber }),
        adapter.issues.listComments({ owner, repo, issue_number: issueNumber, per_page: MAX_COMMENTS }),
      ])

      const issue = issueResult.data
      const truncatedBody = issue.body ? issue.body.slice(0, MAX_BODY_CHARS) : null

      const comments = commentsResult.data.map((c) => ({
        user: c.user?.login,
        body: c.body?.slice(0, 500),
      }))

      return {
        title: issue.title,
        body: truncatedBody,
        state: issue.state,
        labels: issue.labels?.map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean),
        user: issue.user?.login,
        comments,
        createdAt: issue.created_at,
      }
    } catch (err) {
      return { error: `Failed to fetch issue: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
