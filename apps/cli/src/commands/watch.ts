import { resolveToken, GitHubClient, type ResolvedToken, type WorkflowRun } from '@orchentra/cli-api'
import { computeBackoff, DEFAULT_RETRY_CONFIG } from '@orchentra/cli-api'
import { assertOrgAllowed, OrgNotAllowedError } from './org-guard'

export interface WatchEvent {
  kind: 'poll' | 'triage' | 'error' | 'skip'
  status: 'success' | 'failure' | 'retrying'
  message?: string
  retryable?: boolean
  runId?: number
}

export interface WatchOptions {
  repo: string
  intervalMs?: number
  maxPolls?: number
  resolveToken?: () => ResolvedToken | null
  assertOrgAllowed?: (owner: string) => void
  fetchRuns?: (client: GitHubClient, owner: string, repo: string) => Promise<WorkflowRun[]>
  runTriage?: (spec: string) => Promise<{ posted: boolean; runId: number }>
  onEvent?: (event: WatchEvent) => void
}

const DEFAULT_INTERVAL_MS = 30_000

export async function runWatch(options: WatchOptions): Promise<number> {
  const [owner, repo] = parseRepo(options.repo)
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const maxPolls = options.maxPolls ?? Infinity

  const tokenFn = options.resolveToken ?? (() => resolveToken())
  const resolved = tokenFn()
  if (!resolved) {
    return 1
  }
  const { token } = resolved

  const assertOrg = options.assertOrgAllowed ?? ((o: string) => assertOrgAllowed(o))
  try {
    assertOrg(owner)
  } catch (err) {
    if (err instanceof OrgNotAllowedError) {
      return 2
    }
    return 1
  }

  const client = new GitHubClient({ token })
  const fetchRuns = options.fetchRuns ?? defaultFetchRuns()
  const triage = options.runTriage ?? defaultTriage()
  const emit = options.onEvent ?? (() => {})

  const seen = new Set<number>()
  let polls = 0

  while (polls < maxPolls) {
    const runs = await pollWithRetry(client, owner, repo, fetchRuns, emit)
    polls++

    for (const run of runs) {
      if (seen.has(run.id)) {
        emit({ kind: 'skip', status: 'success', runId: run.id })
        continue
      }
      seen.add(run.id)

      if (run.status === 'completed' && run.conclusion === 'failure') {
        const spec = `${owner}/${repo}#${run.id}`
        try {
          await triage(spec)
          emit({ kind: 'triage', status: 'success', runId: run.id })
        } catch (err) {
          emit({
            kind: 'triage',
            status: 'failure',
            runId: run.id,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    if (polls < maxPolls) {
      emit({ kind: 'poll', status: 'success', message: `poll ${polls}, sleeping ${intervalMs}ms` })
      await sleep(intervalMs)
    }
  }

  return 0
}

function parseRepo(repo: string): [string, string] {
  const parts = repo.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`invalid repo format: ${repo}. expected owner/repo`)
  }
  return [parts[0], parts[1]]
}

async function pollWithRetry(
  client: GitHubClient,
  owner: string,
  repo: string,
  fetchRuns: (client: GitHubClient, owner: string, repo: string) => Promise<WorkflowRun[]>,
  emit: (event: WatchEvent) => void,
): Promise<WorkflowRun[]> {
  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchRuns(client, owner, repo)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt < maxRetries) {
        const delay = computeBackoff(attempt, DEFAULT_RETRY_CONFIG)
        emit({ kind: 'error', status: 'retrying', message, retryable: true })
        await sleep(Math.min(delay, 5000))
      } else {
        emit({ kind: 'error', status: 'failure', message, retryable: false })
        return []
      }
    }
  }
  return []
}

function defaultFetchRuns(): (client: GitHubClient, owner: string, repo: string) => Promise<WorkflowRun[]> {
  return async (client, owner, repo) => {
    const response = await client.request<{ workflow_runs: WorkflowRun[] }>(`/repos/${owner}/${repo}/actions/runs`, {
      query: { per_page: 10, status: 'completed' },
    })
    return response.workflow_runs ?? []
  }
}

function defaultTriage(): (spec: string) => Promise<{ posted: boolean; runId: number }> {
  return async (spec) => {
    const { parseRepoRunSpec } = await import('./spec')
    const parsed = parseRepoRunSpec(spec)
    const { triage } = await import('./triage')
    await triage(parsed)
    return { posted: true, runId: parsed.runId }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
