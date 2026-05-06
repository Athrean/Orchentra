import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  title: z.string().describe('Issue title.'),
  body: z.string().optional().describe('Issue body in Markdown.'),
  labels: z.array(z.string()).optional().describe('Labels to apply.'),
  assignees: z.array(z.string()).optional().describe('Logins to assign.'),
})

type Params = z.infer<typeof parameters>

export interface CreateIssueResult {
  number: number
  url: string
}

export interface CreateIssueError {
  error: string
}

export const createIssueOperation: Operation<Params, CreateIssueResult | CreateIssueError> = {
  id: 'create_issue',
  description: 'Create a new GitHub issue in a monitored repository. ' + 'Returns the issue number and URL on success.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'create_issue' },
  handler: async (_ctx, params) => {
    const fullName = `${params.owner}/${params.repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().issues.create({
        owner: params.owner,
        repo: params.repo,
        title: params.title,
        body: params.body,
        labels: params.labels,
        assignees: params.assignees,
      })
      return { number: data.number, url: data.html_url }
    } catch (err) {
      return { error: `Failed to create issue: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
