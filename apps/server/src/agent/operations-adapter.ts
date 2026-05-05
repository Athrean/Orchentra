import { setGitHubAdapter, type GitHubAdapter } from '@orchentra/operations'
import { getOctokit } from '../github/octokit'
import { isRepoMonitored } from '../lib/repo-cache'

function decodeLogsData(data: unknown): string {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf-8')
  if (Buffer.isBuffer(data)) return data.toString('utf-8')
  return String(data)
}

const serverAdapter: GitHubAdapter = {
  isRepoAllowed: (fullName) => isRepoMonitored(fullName),
  listJobsForWorkflowRun: async ({ owner, repo, runId }) => {
    const { data } = await getOctokit().actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId,
    })
    return { jobs: data.jobs }
  },
  downloadJobLogs: async ({ owner, repo, jobId }) => {
    const { data } = await getOctokit().actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: jobId,
    })
    return decodeLogsData(data)
  },
}

let installed = false

export function ensureServerOperationsWired(): void {
  if (installed) return
  setGitHubAdapter(serverAdapter)
  installed = true
}
