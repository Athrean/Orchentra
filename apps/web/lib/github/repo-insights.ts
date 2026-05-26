import { Octokit } from '@octokit/rest'
import { mintInstallationToken } from './app-jwt'

export interface WorkflowRunSummary {
  id: number
  name: string
  status: string
  conclusion: string | null
  htmlUrl: string
  createdAt: string
  updatedAt: string
  durationMs: number | null
  repoFullName: string
  headBranch: string
  headSha: string
  event: string
}

export interface RepoInsights {
  repoFullName: string
  runs: WorkflowRunSummary[]
  total: number
  failures: number
  successes: number
}

interface OctokitRun {
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

const octokitCache = new Map<number, Octokit>()

async function getOctokit(installationId: number): Promise<Octokit> {
  const existing = octokitCache.get(installationId)
  if (existing) return existing
  const token = await mintInstallationToken(installationId)
  const client = new Octokit({ auth: token })
  octokitCache.set(installationId, client)
  // Token lives 1h. Clear after 50m to be safe.
  setTimeout(() => octokitCache.delete(installationId), 50 * 60 * 1000).unref?.()
  return client
}

function pickDuration(run: OctokitRun): number | null {
  if (!run.run_started_at || !run.updated_at) return null
  const start = Date.parse(run.run_started_at)
  const end = Date.parse(run.updated_at)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, end - start)
}

export async function getRepoInsights(
  installationId: number,
  repoFullName: string,
  sinceIso: string,
): Promise<RepoInsights> {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) {
    return { repoFullName, runs: [], total: 0, failures: 0, successes: 0 }
  }

  const octokit = await getOctokit(installationId)
  const res = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
    owner,
    repo,
    per_page: 50,
    created: `>=${sinceIso.slice(0, 10)}`,
  })
  const data = res.data as { workflow_runs: OctokitRun[] }

  const runs: WorkflowRunSummary[] = data.workflow_runs.map((r) => ({
    id: r.id,
    name: r.name ?? '(unnamed)',
    status: r.status ?? 'unknown',
    conclusion: r.conclusion,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    durationMs: pickDuration(r),
    repoFullName,
    headBranch: r.head_branch ?? '',
    headSha: r.head_sha,
    event: r.event,
  }))

  const failures = runs.filter((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out').length
  const successes = runs.filter((r) => r.conclusion === 'success').length

  return { repoFullName, runs, total: runs.length, failures, successes }
}

export async function getInsightsForRepos(
  pairs: Array<{ installationId: number; repoFullName: string }>,
  sinceIso: string,
): Promise<RepoInsights[]> {
  const limited = pairs.slice(0, 25)
  return Promise.all(
    limited.map((p) =>
      getRepoInsights(p.installationId, p.repoFullName, sinceIso).catch(
        () =>
          ({
            repoFullName: p.repoFullName,
            runs: [],
            total: 0,
            failures: 0,
            successes: 0,
          }) satisfies RepoInsights,
      ),
    ),
  )
}

export function aggregateInsights(insights: RepoInsights[]) {
  const totalRuns = insights.reduce((s, r) => s + r.total, 0)
  const totalFailures = insights.reduce((s, r) => s + r.failures, 0)
  const totalSuccesses = insights.reduce((s, r) => s + r.successes, 0)
  const successRate = totalRuns > 0 ? totalSuccesses / totalRuns : null
  const durations = insights.flatMap((r) => r.runs.map((x) => x.durationMs).filter((d): d is number => d !== null))
  const avgDurationMs = durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : null
  return { totalRuns, totalFailures, totalSuccesses, successRate, avgDurationMs }
}
