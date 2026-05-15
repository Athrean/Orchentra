import { isFailingJob, listWorkflowJobs } from '@orchentra/cli-api'
import type { GitHubClient, WorkflowConclusion, WorkflowRun } from '@orchentra/cli-api'

export interface FailingJobSummary {
  readonly name: string
  readonly url: string
  readonly conclusion: WorkflowConclusion
}

export interface PollOutcome {
  readonly status: 'success' | 'failure' | 'timeout'
  readonly polls: number
  readonly failingJobs: FailingJobSummary[]
}

export interface PollCiDeps {
  /** List workflow runs for the branch. */
  readonly listRuns: (branch: string) => Promise<WorkflowRun[]>
  /** List failing jobs for a run. */
  readonly listFailingJobs: (runId: number) => Promise<FailingJobSummary[]>
  /** Sleep ms; injected for tests. */
  readonly sleep: (ms: number) => Promise<void>
  /** Streaming progress sink. */
  readonly write?: (text: string) => void
}

export interface PollCiOptions {
  readonly branch: string
  readonly intervalMs?: number
  readonly maxPolls?: number
}

const DEFAULT_INTERVAL_MS = 30_000
const DEFAULT_MAX_POLLS = 40

export async function pollCiForBranch(options: PollCiOptions, deps: PollCiDeps): Promise<PollOutcome> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS
  const write = deps.write ?? ((): void => undefined)

  for (let polls = 1; polls <= maxPolls; polls++) {
    const runs = await deps.listRuns(options.branch)
    const latest = pickLatest(runs)
    if (!latest) {
      write(`No workflow run yet for ${options.branch}; waiting...\n`)
      await deps.sleep(intervalMs)
      continue
    }

    if (latest.status !== 'completed') {
      write(`Run ${latest.id} is ${latest.status}; waiting (poll ${polls}/${maxPolls})...\n`)
      await deps.sleep(intervalMs)
      continue
    }

    if (latest.conclusion === 'success') {
      write(`Run ${latest.id} succeeded.\n`)
      return { status: 'success', polls, failingJobs: [] }
    }

    const failingJobs = await deps.listFailingJobs(latest.id)
    write(`Run ${latest.id} concluded as ${latest.conclusion ?? 'unknown'}.\n`)
    for (const job of failingJobs) {
      write(`  - ${job.name} (${job.conclusion ?? 'failure'}): ${job.url}\n`)
    }
    return { status: 'failure', polls, failingJobs }
  }

  write(`Polling timed out after ${maxPolls} attempts.\n`)
  return { status: 'timeout', polls: maxPolls, failingJobs: [] }
}

function pickLatest(runs: WorkflowRun[]): WorkflowRun | null {
  if (runs.length === 0) return null
  // GitHub's list-workflow-runs is newest-first, but be defensive.
  return runs.reduce<WorkflowRun | null>((acc, run) => (acc === null || run.id > acc.id ? run : acc), null)
}

/**
 * Default `listRuns` implementation hitting the GitHub API.
 */
export function defaultListRuns(client: GitHubClient, owner: string, repo: string) {
  return async (branch: string): Promise<WorkflowRun[]> => {
    const response = await client.request<{ workflow_runs: WorkflowRun[] }>(`/repos/${owner}/${repo}/actions/runs`, {
      query: { branch, per_page: 5 },
    })
    return response.workflow_runs ?? []
  }
}

/**
 * Default `listFailingJobs` implementation hitting the GitHub API.
 */
export function defaultListFailingJobs(client: GitHubClient, owner: string, repo: string) {
  return async (runId: number): Promise<FailingJobSummary[]> => {
    const jobs = await listWorkflowJobs(client, owner, repo, runId)
    return jobs.filter(isFailingJob).map((job) => ({
      name: job.name,
      url: job.html_url,
      conclusion: job.conclusion,
    }))
  }
}
