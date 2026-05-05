/**
 * Minimal GitHub surface the operations package depends on. Concrete clients
 * (Octokit in production, fakes in tests) are wired in by the host app via
 * `setGitHubAdapter`. Keeping the contract narrow here means the operations
 * package never imports `@octokit/rest`, server-only config, or drizzle.
 */

export interface GitHubJobStep {
  name?: string
  conclusion?: string | null
}

export interface GitHubJob {
  id: number
  name: string
  conclusion: string | null
  steps?: GitHubJobStep[]
  started_at?: string | null
  completed_at?: string | null
}

export interface ListJobsResult {
  jobs: GitHubJob[]
}

export interface GitHubAdapter {
  isRepoAllowed(fullName: string): Promise<boolean>
  listJobsForWorkflowRun(input: { owner: string; repo: string; runId: number }): Promise<ListJobsResult>
  downloadJobLogs(input: { owner: string; repo: string; jobId: number }): Promise<string>
}

let adapter: GitHubAdapter | null = null

export function setGitHubAdapter(next: GitHubAdapter | null): void {
  adapter = next
}

export function getGitHubAdapter(): GitHubAdapter {
  if (!adapter) {
    throw new Error(
      'GitHubAdapter is not configured. Call setGitHubAdapter() during host boot before invoking GitHub operations.',
    )
  }
  return adapter
}
