import { Octokit } from '@octokit/rest'
import { mintInstallationToken } from './app-jwt'

export interface OctokitRunDetail {
  id: number
  name: string | null
  status: string | null
  conclusion: string | null
  html_url: string
  created_at: string
  updated_at: string
  run_started_at: string | null
  head_branch: string | null
  head_sha: string
  event: string
}

export interface OctokitStep {
  name: string
  number: number
  status: string | null
  conclusion: string | null
}

export interface OctokitAnnotation {
  message: string | null
  path: string
  start_line: number | null
  annotation_level: string | null
}

export interface OctokitJob {
  id: number
  name: string
  status: string | null
  conclusion: string | null
  html_url: string | null
  check_run_url?: string | null
  steps?: OctokitStep[]
}

export interface RunStep {
  name: string
  number: number
  status: string
  conclusion: string | null
}

export interface RunAnnotation {
  message: string
  path: string
  startLine: number
  level: string
}

export interface RunJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  failed: boolean
  htmlUrl: string
  steps: RunStep[]
  annotations: RunAnnotation[]
}

export interface RunDetail {
  id: number
  name: string
  status: string
  conclusion: string | null
  repoFullName: string
  headBranch: string
  headSha: string
  event: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
  durationMs: number | null
  jobs: RunJob[]
}

function pickDuration(run: OctokitRunDetail): number | null {
  if (!run.run_started_at) return null
  const start = Date.parse(run.run_started_at)
  const end = Date.parse(run.updated_at)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, end - start)
}

function mapStep(step: OctokitStep): RunStep {
  return {
    name: step.name,
    number: step.number,
    status: step.status ?? 'unknown',
    conclusion: step.conclusion,
  }
}

function mapJob(job: OctokitJob): RunJob {
  return {
    id: job.id,
    name: job.name,
    status: job.status ?? 'unknown',
    conclusion: job.conclusion,
    failed: job.conclusion === 'failure' || job.conclusion === 'timed_out',
    htmlUrl: job.html_url ?? '',
    steps: (job.steps ?? []).map(mapStep),
    annotations: [],
  }
}

export function mapAnnotations(raw: OctokitAnnotation[], cap: number): RunAnnotation[] {
  return raw.slice(0, cap).map((a) => ({
    message: a.message ?? '',
    path: a.path,
    startLine: a.start_line ?? 0,
    level: a.annotation_level ?? 'notice',
  }))
}

export function mapRunDetail(run: OctokitRunDetail, jobs: OctokitJob[], repoFullName: string): RunDetail {
  return {
    id: run.id,
    name: run.name ?? '(unnamed)',
    status: run.status ?? 'unknown',
    conclusion: run.conclusion,
    repoFullName,
    headBranch: run.head_branch ?? '',
    headSha: run.head_sha,
    event: run.event,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    durationMs: pickDuration(run),
    jobs: orderFailedFirst(jobs.map(mapJob)),
  }
}

function orderFailedFirst(jobs: RunJob[]): RunJob[] {
  return [...jobs.filter((j) => j.failed), ...jobs.filter((j) => !j.failed)]
}

/**
 * Fetch a single workflow run plus its jobs and map them to the typed detail
 * shape. Returns null when the run does not exist or GitHub errors, so the
 * detail page can render a graceful not-found state instead of throwing.
 */
export async function getRunDetail(
  installationId: number,
  repoFullName: string,
  runId: number,
): Promise<RunDetail | null> {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) return null

  try {
    const token = await mintInstallationToken(installationId)
    const octokit = new Octokit({ auth: token })
    const [runRes, jobsRes] = await Promise.all([
      octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', { owner, repo, run_id: runId }),
      octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
        owner,
        repo,
        run_id: runId,
        per_page: 100,
      }),
    ])
    const run = runRes.data as OctokitRunDetail
    const jobs = (jobsRes.data as { jobs: OctokitJob[] }).jobs
    const detail = mapRunDetail(run, jobs, repoFullName)
    await attachAnnotations(octokit, owner, repo, jobs, detail)
    return detail
  } catch {
    return null
  }
}

const ANNOTATION_CAP = 20

function checkRunId(url: string | null | undefined): number | null {
  if (!url) return null
  const id = Number(url.split('/').pop())
  return Number.isInteger(id) ? id : null
}

// Best-effort: attach check-run annotations to each failed job. A failed
// annotation fetch for one job must not sink the whole page.
async function attachAnnotations(
  octokit: Octokit,
  owner: string,
  repo: string,
  rawJobs: OctokitJob[],
  detail: RunDetail,
): Promise<void> {
  const byId = new Map(detail.jobs.map((j) => [j.id, j]))
  await Promise.all(
    rawJobs.map(async (raw) => {
      const job = byId.get(raw.id)
      if (!job || !job.failed) return
      const checkId = checkRunId(raw.check_run_url)
      if (checkId === null) return
      try {
        const res = await octokit.request('GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations', {
          owner,
          repo,
          check_run_id: checkId,
        })
        job.annotations = mapAnnotations(res.data as OctokitAnnotation[], ANNOTATION_CAP)
      } catch {
        // leave annotations empty
      }
    }),
  )
}
