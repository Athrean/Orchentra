import { Octokit } from '@octokit/rest'
import { config } from '../config'
import { db, incidents } from '../db/client'

function conclusionToStatus(conclusion: string | null): string {
  switch (conclusion) {
    case 'success':
      return 'resolved'
    case 'failure':
    case 'timed_out':
      return 'error'
    case 'cancelled':
    case 'skipped':
    case 'stale':
      return 'dismissed'
    case 'neutral':
      return 'resolved'
    default:
      return 'error'
  }
}

export async function backfillRepoIncidents(repo: string, orgId: string, latestKnown?: Date | null): Promise<void> {
  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) return

  const octokit = new Octokit({ auth: config.github.token })

  // If we have existing data, only fetch runs from 1 day before our latest run (handles same-day gaps).
  // Otherwise fetch the last 90 days.
  const since = latestKnown
    ? new Date(latestKnown.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let runs: Awaited<ReturnType<typeof octokit.actions.listWorkflowRunsForRepo>>['data']['workflow_runs'] = []
  try {
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
  } catch (err) {
    console.error(`Backfill: failed to fetch runs for ${repo}:`, err)
    return
  }

  for (const run of runs) {
    try {
      await db
        .insert(incidents)
        .values({
          id: crypto.randomUUID(),
          orgId,
          repo,
          branch: run.head_branch ?? 'unknown',
          commit: run.head_sha,
          workflowName: run.name ?? 'Unknown Workflow',
          commitMessage: run.head_commit?.message?.split('\n')[0] ?? null,
          workflowRunId: run.id,
          status: conclusionToStatus(run.conclusion),
          triggeredAt: new Date(run.created_at),
        })
        .onConflictDoNothing({ target: [incidents.orgId, incidents.workflowRunId] })
    } catch (err) {
      console.error(`Backfill: failed to insert run ${run.id}:`, err)
    }
  }

  console.log(`Backfill: imported ${runs.length} runs for ${repo} (org: ${orgId})`)
}
