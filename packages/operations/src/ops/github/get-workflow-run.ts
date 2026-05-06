import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  runId: z.number().int().positive().describe('GitHub Actions workflow run id'),
})

type Params = z.infer<typeof parameters>

export interface WorkflowRunDetails {
  id: number
  name: string | null
  headBranch: string | null
  headSha: string
  status: string | null
  conclusion: string | null
  runAttempt: number | null
  htmlUrl: string
  createdAt: string
  updatedAt: string
  jobsUrl: string
  logsUrl: string
}

export interface GetWorkflowRunError {
  error: string
}

export const getWorkflowRunOperation: Operation<Params, WorkflowRunDetails | GetWorkflowRunError> = {
  id: 'get_workflow_run',
  description:
    'Fetch metadata for a single GitHub Actions workflow run. ' +
    'Returns identifying fields (id, branch, sha, status, conclusion, attempt) plus the URLs needed ' +
    'to drill into jobs or raw logs.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'get_workflow_run' },
  handler: async (_ctx, { owner, repo, runId }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().actions.getWorkflowRun({ owner, repo, run_id: runId })
      return {
        id: data.id,
        name: data.name ?? null,
        headBranch: data.head_branch,
        headSha: data.head_sha,
        status: data.status,
        conclusion: data.conclusion,
        runAttempt: data.run_attempt ?? null,
        htmlUrl: data.html_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        jobsUrl: data.jobs_url,
        logsUrl: data.logs_url,
      }
    } catch (err) {
      return { error: `Failed to fetch workflow run: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
