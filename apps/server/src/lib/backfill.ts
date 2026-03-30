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

export async function backfillRepoIncidents(repo: string, orgId: string): Promise<void> {
  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) return

  const octokit = new Octokit({ auth: config.github.token })

  // Fetch up to 100 completed runs (all conclusions) from the past 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let runs: Awaited<ReturnType<typeof octokit.actions.listWorkflowRunsForRepo>>['data']['workflow_runs'] = []
  try {
    const response = await octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo: repoName,
      status: 'completed',
      per_page: 100,
      created: `>=${since}`,
    })
    runs = response.data.workflow_runs
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
