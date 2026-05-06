import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  issueNumber: z.number().int().positive().describe('Issue number to update.'),
  title: z.string().optional().describe('New title.'),
  body: z.string().optional().describe('New body in Markdown.'),
  state: z.enum(['open', 'closed']).optional().describe("New state: 'open' or 'closed'."),
  labels: z.array(z.string()).optional().describe('Replacement label list.'),
  assignees: z.array(z.string()).optional().describe('Replacement assignee list.'),
})

type Params = z.infer<typeof parameters>

export interface UpdateIssueResult {
  number: number
  url: string
}

export interface UpdateIssueError {
  error: string
}

export const updateIssueOperation: Operation<Params, UpdateIssueResult | UpdateIssueError> = {
  id: 'update_issue',
  description:
    'Update an existing GitHub issue in a monitored repository. ' +
    'All fields except owner, repo, and issueNumber are optional — only supplied fields are changed.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'update_issue' },
  handler: async (_ctx, params) => {
    const fullName = `${params.owner}/${params.repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().issues.update({
        owner: params.owner,
        repo: params.repo,
        issue_number: params.issueNumber,
        title: params.title,
        body: params.body,
        state: params.state,
        labels: params.labels,
        assignees: params.assignees,
      })
      return { number: data.number, url: data.html_url }
    } catch (err) {
      return { error: `Failed to update issue: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
