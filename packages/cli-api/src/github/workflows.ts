import type { GitHubClient } from './octokit'

export type WorkflowConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'neutral'
  | 'stale'
  | null

export interface WorkflowRun {
  readonly id: number
  readonly name: string | null
  readonly head_branch: string
  readonly head_sha: string
  readonly event: string
  readonly status: 'queued' | 'in_progress' | 'completed' | 'waiting'
  readonly conclusion: WorkflowConclusion
  readonly html_url: string
  readonly workflow_id: number
}

export interface WorkflowJobStep {
  readonly name: string
  readonly status: string
  readonly conclusion: WorkflowConclusion
  readonly number: number
}

export interface WorkflowJob {
  readonly id: number
  readonly run_id: number
  readonly name: string
  readonly status: string
  readonly conclusion: WorkflowConclusion
  readonly html_url: string
  readonly steps: WorkflowJobStep[]
}

export async function getWorkflowRun(
  client: GitHubClient,
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowRun> {
  return client.request<WorkflowRun>(`/repos/${owner}/${repo}/actions/runs/${runId}`)
}

export async function listWorkflowJobs(
  client: GitHubClient,
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowJob[]> {
  const response = await client.request<{ jobs: WorkflowJob[] }>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, {
    query: { per_page: 100 },
  })
  return response.jobs ?? []
}

export async function getJobLogs(client: GitHubClient, owner: string, repo: string, jobId: number): Promise<string> {
  return client.requestText(`/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
    accept: 'text/plain',
  })
}

export function isFailingJob(job: WorkflowJob): boolean {
  return job.conclusion === 'failure' || job.conclusion === 'timed_out' || job.conclusion === 'action_required'
}
