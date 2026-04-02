import { Octokit } from '@octokit/rest'
import { config } from '../config'

const octokit = new Octokit({ auth: config.github.token })

export interface WorkflowSummary {
  id: number
  name: string
  path: string
  state: string
  /** ISO timestamp of the latest run, or null if no runs yet. */
  latestRunAt: string | null
  /** Conclusion of the latest run: 'success' | 'failure' | 'in_progress' | null */
  latestConclusion: string | null
}

export interface WorkflowRun {
  id: number
  name: string | null
  headBranch: string | null
  headSha: string
  status: string | null
  conclusion: string | null
  runNumber: number
  event: string
  createdAt: string
  updatedAt: string
  htmlUrl: string
  durationSeconds: number | null
}

export interface GitHubApiError {
  error: string
  status?: number
}

function parseRepo(fullName: string): { owner: string; repo: string } | null {
  const parts = fullName.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { owner: parts[0], repo: parts[1] }
}

/** List all workflow definitions for a repo with last-run status. */
export async function listWorkflows(repoFullName: string): Promise<WorkflowSummary[] | GitHubApiError> {
  const parsed = parseRepo(repoFullName)
  if (!parsed) return { error: 'Invalid repo format', status: 400 }
  const { owner, repo } = parsed

  try {
    const [{ data: wfData }, { data: runsData }] = await Promise.all([
      octokit.actions.listRepoWorkflows({ owner, repo, per_page: 100 }),
      octokit.actions.listWorkflowRunsForRepo({ owner, repo, per_page: 30 }),
    ])

    // Index latest run per workflow id
    const latestRun = new Map<number, { created_at: string; conclusion: string | null; status: string | null }>()
    for (const run of runsData.workflow_runs) {
      if (!run.workflow_id) continue
      if (!latestRun.has(run.workflow_id)) {
        latestRun.set(run.workflow_id, {
          created_at: run.created_at,
          conclusion: run.conclusion ?? null,
          status: run.status ?? null,
        })
      }
    }

    return wfData.workflows.map((wf) => {
      const latest = latestRun.get(wf.id)
      return {
        id: wf.id,
        name: wf.name,
        path: wf.path,
        state: wf.state,
        latestRunAt: latest?.created_at ?? null,
        latestConclusion: latest?.status === 'in_progress' ? 'in_progress' : (latest?.conclusion ?? null),
      }
    })
  } catch (err) {
    const status = (err as { status?: number }).status
    return { error: `GitHub API error: ${err instanceof Error ? err.message : String(err)}`, status }
  }
}

/** List recent runs for a specific workflow. */
export async function listWorkflowRuns(
  repoFullName: string,
  workflowId: number,
  perPage = 20,
): Promise<WorkflowRun[] | GitHubApiError> {
  const parsed = parseRepo(repoFullName)
  if (!parsed) return { error: 'Invalid repo format', status: 400 }
  const { owner, repo } = parsed

  try {
    const { data } = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowId,
      per_page: Math.min(perPage, 30),
    })

    return data.workflow_runs.map((run) => {
      const duration =
        run.updated_at && run.created_at
          ? Math.round((new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()) / 1000)
          : null
      return {
        id: run.id,
        name: run.name ?? null,
        headBranch: run.head_branch ?? null,
        headSha: run.head_sha,
        status: run.status ?? null,
        conclusion: run.conclusion ?? null,
        runNumber: run.run_number,
        event: run.event,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        htmlUrl: run.html_url,
        durationSeconds: duration,
      }
    })
  } catch (err) {
    const status = (err as { status?: number }).status
    return { error: `GitHub API error: ${err instanceof Error ? err.message : String(err)}`, status }
  }
}

/** Trigger a workflow dispatch event. */
export async function dispatchWorkflow(
  repoFullName: string,
  workflowId: number,
  ref: string,
  inputs?: Record<string, string>,
): Promise<{ ok: true } | GitHubApiError> {
  const parsed = parseRepo(repoFullName)
  if (!parsed) return { error: 'Invalid repo format', status: 400 }
  const { owner, repo } = parsed

  try {
    await octokit.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: workflowId,
      ref,
      inputs,
    })
    return { ok: true }
  } catch (err) {
    const status = (err as { status?: number }).status
    return { error: `GitHub API error: ${err instanceof Error ? err.message : String(err)}`, status }
  }
}

/** Cancel an in-progress workflow run. */
export async function cancelWorkflowRun(repoFullName: string, runId: number): Promise<{ ok: true } | GitHubApiError> {
  const parsed = parseRepo(repoFullName)
  if (!parsed) return { error: 'Invalid repo format', status: 400 }
  const { owner, repo } = parsed

  try {
    await octokit.actions.cancelWorkflowRun({ owner, repo, run_id: runId })
    return { ok: true }
  } catch (err) {
    const status = (err as { status?: number }).status
    return { error: `GitHub API error: ${err instanceof Error ? err.message : String(err)}`, status }
  }
}
