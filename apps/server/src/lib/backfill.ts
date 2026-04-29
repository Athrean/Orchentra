import { Octokit } from '@octokit/rest'
import { buildOctokit } from '../github/octokit'
import { eq, max, inArray } from 'drizzle-orm'
import { config } from '../config'
import { db, incidents, monitoredRepos, orgMembers, users } from '../db/client'
import { incidentEvents } from '../events'

type BackfillTokenSource = 'user' | 'app'
type WorkflowRuns = Awaited<
  ReturnType<InstanceType<typeof Octokit>['actions']['listWorkflowRunsForRepo']>
>['data']['workflow_runs']
type OctokitLogger = NonNullable<ConstructorParameters<typeof Octokit>[0]>['log']

const silentOctokitLogger: OctokitLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

/**
 * Run async tasks with a concurrency cap using a worker-pool pattern.
 * No external dependencies required.
 */
export async function withConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  if (tasks.length === 0) return []
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++
      results[index] = await tasks[index]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext())
  await Promise.all(workers)
  return results
}

/** Only failure-class conclusions produce incidents. */
function isFailureConclusion(conclusion: string | null): boolean {
  return conclusion === 'failure' || conclusion === 'timed_out'
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}

function getErrorStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object' || !('status' in err)) return null
  return typeof err.status === 'number' ? err.status : null
}

function shouldRetryWithAppToken(err: unknown): boolean {
  const msg = getErrorMessage(err)
  return (
    msg.includes('OAuth App access restrictions') ||
    msg.includes('Resource not accessible by integration') ||
    getErrorStatus(err) === 404
  )
}

function getBackfillAuthCandidates(userToken?: string | null): Array<{ source: BackfillTokenSource; token: string }> {
  const candidates: Array<{ source: BackfillTokenSource; token: string }> = []
  if (userToken) candidates.push({ source: 'user', token: userToken })
  if (!userToken || userToken !== config.github.token) {
    candidates.push({ source: 'app', token: config.github.token })
  }
  return candidates
}

async function listCompletedWorkflowRuns(
  owner: string,
  repoName: string,
  since: string,
  authToken: string,
): Promise<WorkflowRuns> {
  const octokit = buildOctokit({ auth: authToken, log: silentOctokitLogger })
  let runs: WorkflowRuns = []

  // Paginate up to 5 pages (500 runs) to get meaningful history
  for (let page = 1; page <= 5; page++) {
    const response = await octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo: repoName,
      status: 'completed',
      per_page: 100,
      page,
      created: `>=${since}`,
    })
    runs = runs.concat(response.data.workflow_runs)
    if (response.data.workflow_runs.length < 100) break
  }

  return runs
}

export async function backfillRepoIncidents(
  repo: string,
  orgId: string,
  latestKnown?: Date | null,
  userToken?: string | null,
): Promise<void> {
  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) return

  // If we have existing data, only fetch runs from 1 day before our latest run (handles same-day gaps).
  // Otherwise fetch the last 365 days for a complete initial import.
  const since = latestKnown
    ? new Date(latestKnown.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let runs: WorkflowRuns = []
  let tokenSource: BackfillTokenSource = userToken ? 'user' : 'app'
  let lastError: unknown = null
  const authCandidates = getBackfillAuthCandidates(userToken)

  for (const [index, candidate] of authCandidates.entries()) {
    tokenSource = candidate.source
    try {
      runs = await listCompletedWorkflowRuns(owner, repoName, since, candidate.token)
      lastError = null
      break
    } catch (err: unknown) {
      lastError = err
      const hasFallbackCandidate = index < authCandidates.length - 1
      if (candidate.source === 'user' && hasFallbackCandidate && shouldRetryWithAppToken(err)) {
        continue
      }
      break
    }
  }

  if (lastError) {
    const msg = getErrorMessage(lastError)
    const isOrgRestriction = msg.includes('OAuth App access restrictions')
    if (isOrgRestriction) {
      console.warn(`Backfill: skipping ${repo} — org has OAuth App access restrictions`)
    } else {
      console.error(`Backfill: failed to fetch runs for ${repo}:`, lastError)
    }
    return
  }

  // Only ingest failure-class runs — success/cancelled/skipped are not incidents
  const failureRuns = runs.filter((run) => isFailureConclusion(run.conclusion))

  let inserted = 0
  if (failureRuns.length > 0) {
    try {
      const values = failureRuns.map((run) => ({
        id: crypto.randomUUID(),
        orgId,
        repo,
        branch: run.head_branch ?? 'unknown',
        commit: run.head_sha,
        workflowName: run.name ?? 'Unknown Workflow',
        commitMessage: run.head_commit?.message?.split('\n')[0] ?? null,
        workflowRunId: run.id,
        status: 'error' as const,
        triggeredAt: new Date(run.created_at),
      }))

      const insertedRows = await db
        .insert(incidents)
        .values(values)
        .onConflictDoNothing({ target: [incidents.orgId, incidents.workflowRunId] })
        .returning({ id: incidents.id })
      inserted = insertedRows.length
    } catch (err) {
      console.error(`Backfill: failed to batch-insert runs for ${repo}:`, err)
    }
  }

  console.log(
    `Backfill [${tokenSource}]: ${repo} — ${runs.length} runs fetched, ${failureRuns.length} failures, ${inserted} new (since ${since})`,
  )

  // Notify connected clients so they refetch the incidents list
  if (inserted > 0) {
    incidentEvents.emitIncidentEvent({
      type: 'incident:created',
      incidentId: 'backfill',
      orgId,
      repo,
      data: { source: 'backfill', count: inserted },
    })
  }
}

/**
 * Backfill all monitored repos for a user's orgs using their fresh OAuth token.
 * Called after login so repos sync immediately instead of waiting for the periodic sync.
 */
export async function backfillUserOrgRepos(userId: string): Promise<void> {
  // Look up user's token and orgs
  const [user] = await db.select({ token: users.githubAccessToken }).from(users).where(eq(users.id, userId)).limit(1)

  if (!user?.token) {
    console.log('Post-login backfill: no GitHub token for user, skipping')
    return
  }

  const memberRows = await db.select({ orgId: orgMembers.orgId }).from(orgMembers).where(eq(orgMembers.userId, userId))

  if (memberRows.length === 0) return

  // Get latest incident per (org, repo) so we only fetch new runs — scoped by org
  // to avoid cross-org timestamp collisions when multiple orgs monitor the same repo.
  const orgIds = memberRows.map((m) => m.orgId)
  const latestPerRepo = await db
    .select({ orgId: incidents.orgId, repo: incidents.repo, latest: max(incidents.triggeredAt) })
    .from(incidents)
    .where(inArray(incidents.orgId, orgIds))
    .groupBy(incidents.orgId, incidents.repo)
  const latestMap = new Map(latestPerRepo.map((r) => [`${r.orgId}:${r.repo}`, r.latest]))

  for (const { orgId } of memberRows) {
    const repos = await db
      .select({ repo: monitoredRepos.repo })
      .from(monitoredRepos)
      .where(eq(monitoredRepos.orgId, orgId))

    console.log(`Post-login backfill: syncing ${repos.length} repos for org ${orgId}`)

    const tasks = repos.map(
      ({ repo }) =>
        () =>
          backfillRepoIncidents(repo, orgId, latestMap.get(`${orgId}:${repo}`), user.token).catch(console.error),
    )
    await withConcurrency(tasks, 3)
  }
}
