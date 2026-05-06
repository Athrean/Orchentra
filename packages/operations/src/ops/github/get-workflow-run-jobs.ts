import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  runId: z.number().int().positive().describe('GitHub Actions workflow run id'),
  attempt: z.number().int().positive().optional().describe('Specific run attempt to fetch (defaults to latest)'),
})

type Params = z.infer<typeof parameters>

export interface WorkflowJobStep {
  name: string
  status: string
  conclusion: string | null
  number: number
  startedAt: string | null
  completedAt: string | null
}

export interface WorkflowJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  steps: WorkflowJobStep[]
}

export interface GetWorkflowRunJobsResult {
  jobs: WorkflowJob[]
}

export interface GetWorkflowRunJobsError {
  error: string
}

export const getWorkflowRunJobsOperation: Operation<Params, GetWorkflowRunJobsResult | GetWorkflowRunJobsError> = {
  id: 'get_workflow_run_jobs',
  description:
    'List the jobs (and per-job steps) for a GitHub Actions workflow run. ' +
    'Use this to identify which job(s) failed and at which step before pulling logs.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'get_workflow_run_jobs' },
  handler: async (_ctx, { owner, repo, runId, attempt }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
        attempt_number: attempt,
      })
      const jobs: WorkflowJob[] = data.jobs.map((j) => ({
        id: j.id,
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        startedAt: j.started_at,
        completedAt: j.completed_at,
        steps: (j.steps ?? []).map((s) => ({
          name: s.name,
          status: s.status,
          conclusion: s.conclusion,
          number: s.number,
          startedAt: s.started_at ?? null,
          completedAt: s.completed_at ?? null,
        })),
      }))
      return { jobs }
    } catch (err) {
      return { error: `Failed to fetch workflow run jobs: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
