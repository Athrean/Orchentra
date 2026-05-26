import { Octokit } from '@octokit/rest'
import { mintInstallationToken } from './app-jwt'

// Retry the failed jobs of a workflow run. Requires the GitHub App to hold the
// `actions: write` permission. Throws on an invalid repo or a GitHub error.
export async function rerunFailedJobs(installationId: number, repoFullName: string, runId: number): Promise<void> {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) throw new Error('invalid repo')

  const token = await mintInstallationToken(installationId)
  const octokit = new Octokit({ auth: token })
  await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs', {
    owner,
    repo,
    run_id: runId,
  })
}
