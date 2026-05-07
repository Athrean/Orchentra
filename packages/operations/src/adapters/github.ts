/**
 * Minimal GitHub adapter contract used by the migrated read-scoped ops.
 * Defined here so the operations package stays self-contained — concrete
 * Octokit wiring lives in the server, which calls setGithubAdapter() at boot.
 */
export interface GithubAdapter {
  pulls: {
    get: (p: { owner: string; repo: string; pull_number: number }) => Promise<{ data: GithubPull }>
    list: (p: {
      owner: string
      repo: string
      state?: 'open' | 'closed' | 'all'
      head?: string
      base?: string
      sort?: 'created' | 'updated' | 'popularity' | 'long-running'
      direction?: 'asc' | 'desc'
      per_page?: number
      page?: number
    }) => Promise<{ data: GithubPullSummary[] }>
    listFiles: (p: {
      owner: string
      repo: string
      pull_number: number
      per_page?: number
    }) => Promise<{ data: GithubPullFile[] }>
    listReviewComments: (p: {
      owner: string
      repo: string
      pull_number: number
      per_page?: number
    }) => Promise<{ data: GithubComment[] }>
    create: (p: {
      owner: string
      repo: string
      title: string
      head: string
      base: string
      body?: string
      draft?: boolean
      maintainer_can_modify?: boolean
    }) => Promise<{ data: GithubPullRefSummary }>
    requestReviewers: (p: {
      owner: string
      repo: string
      pull_number: number
      reviewers?: string[]
      team_reviewers?: string[]
    }) => Promise<{ data: GithubReviewersResponse }>
    merge: (p: {
      owner: string
      repo: string
      pull_number: number
      commit_title?: string
      commit_message?: string
      sha?: string
      merge_method?: 'merge' | 'squash' | 'rebase'
    }) => Promise<{ data: GithubMergePullRequest }>
  }
  issues: {
    get: (p: { owner: string; repo: string; issue_number: number }) => Promise<{ data: GithubIssue }>
    list: (p: {
      owner: string
      repo: string
      state?: 'open' | 'closed' | 'all'
      labels?: string
      assignee?: string
      creator?: string
      since?: string
      per_page?: number
      page?: number
    }) => Promise<{ data: GithubIssueSummary[] }>
    listComments: (p: {
      owner: string
      repo: string
      issue_number: number
      per_page?: number
    }) => Promise<{ data: GithubComment[] }>
    create: (p: {
      owner: string
      repo: string
      title: string
      body?: string
      labels?: string[]
      assignees?: string[]
    }) => Promise<{ data: GithubIssueRefSummary }>
    update: (p: {
      owner: string
      repo: string
      issue_number: number
      title?: string
      body?: string
      state?: 'open' | 'closed'
      labels?: string[]
      assignees?: string[]
    }) => Promise<{ data: GithubIssueRefSummary }>
  }
  repos: {
    get: (p: { owner: string; repo: string }) => Promise<{ data: GithubRepo }>
    getCommit: (p: { owner: string; repo: string; ref: string }) => Promise<{ data: GithubCommit }>
    getContent: (p: { owner: string; repo: string; path: string; ref?: string }) => Promise<{ data: GithubContent }>
    listBranches: (p: {
      owner: string
      repo: string
      protected?: boolean
      per_page?: number
      page?: number
    }) => Promise<{ data: GithubBranch[] }>
    listLanguages: (p: { owner: string; repo: string }) => Promise<{ data: Record<string, number> }>
    getAllTopics: (p: { owner: string; repo: string }) => Promise<{ data: { names: string[] } }>
    createCommitStatus: (p: {
      owner: string
      repo: string
      sha: string
      state: 'error' | 'failure' | 'pending' | 'success'
      target_url?: string
      description?: string
      context?: string
    }) => Promise<{ data: GithubCommitStatus }>
    createOrUpdateFileContents: (p: {
      owner: string
      repo: string
      path: string
      message: string
      content: string
      branch?: string
      sha?: string
    }) => Promise<{ data: GithubCreateOrUpdateFileResponse }>
  }
  git: {
    createRef: (p: { owner: string; repo: string; ref: string; sha: string }) => Promise<{ data: GithubGitRef }>
  }
  checks: {
    listForRef: (p: {
      owner: string
      repo: string
      ref: string
      per_page?: number
      page?: number
    }) => Promise<{ data: { total_count: number; check_runs: GithubCheckRun[] } }>
    create: (p: {
      owner: string
      repo: string
      name: string
      head_sha: string
      status?: 'queued' | 'in_progress' | 'completed'
      conclusion?: string
      details_url?: string
      output?: { title: string; summary: string; text?: string }
    }) => Promise<{ data: GithubCheckRun }>
  }
  actions: {
    listWorkflowRunsForRepo: (p: {
      owner: string
      repo: string
      status?: string
      branch?: string
      event?: string
      per_page?: number
      page?: number
    }) => Promise<{ data: GithubWorkflowRunList }>
    getWorkflowRun: (p: { owner: string; repo: string; run_id: number }) => Promise<{ data: GithubWorkflowRun }>
    listJobsForWorkflowRun: (p: {
      owner: string
      repo: string
      run_id: number
      attempt_number?: number
    }) => Promise<{ data: GithubWorkflowRunJobList }>
    downloadJobLogsForWorkflowRun: (p: {
      owner: string
      repo: string
      job_id: number
    }) => Promise<{ data: string | ArrayBuffer | Buffer }>
    listWorkflowRunArtifacts: (p: {
      owner: string
      repo: string
      run_id: number
    }) => Promise<{ data: { total_count: number; artifacts: GithubArtifact[] } }>
    downloadArtifact: (p: {
      owner: string
      repo: string
      artifact_id: number
      archive_format: string
    }) => Promise<{ data: ArrayBuffer | Buffer | Uint8Array }>
    // Mutating Actions ops (Slice 7). All four return 204 No Content from
    // GitHub on success; we model that as `void` so adapters don't have to
    // invent a response payload. The dispatcher's approval gate runs before
    // these ever execute on a remote ctx.
    reRunWorkflow: (p: { owner: string; repo: string; run_id: number; enable_debug_logging?: boolean }) => Promise<void>
    reRunWorkflowFailedJobs: (p: {
      owner: string
      repo: string
      run_id: number
      enable_debug_logging?: boolean
    }) => Promise<void>
    cancelWorkflowRun: (p: { owner: string; repo: string; run_id: number }) => Promise<void>
    createWorkflowDispatch: (p: {
      owner: string
      repo: string
      // Octokit accepts either a numeric id or a workflow filename ('ci.yml').
      workflow_id: string | number
      ref: string
      inputs?: Record<string, string>
    }) => Promise<void>
    // Slice H mutating Actions ops. delete_artifact returns 204 No Content
    // on success; the secret ops surface { name, updated_at } summaries
    // (never values) for list and a void ack for set.
    deleteArtifact: (p: { owner: string; repo: string; artifact_id: number }) => Promise<void>
    listRepoSecrets: (p: {
      owner: string
      repo: string
      per_page?: number
    }) => Promise<{ data: { total_count: number; secrets: GithubRepoSecretSummary[] } }>
    setRepoSecret: (p: { owner: string; repo: string; secret_name: string; value: string }) => Promise<void>
  }
  search: {
    code: (p: { q: string; per_page?: number }) => Promise<{ data: GithubCodeSearch }>
  }
}

export interface GithubPull {
  title: string
  body: string | null
  state: string
  merged: boolean
  user?: { login?: string } | null
  base: { ref: string }
  head: { ref: string }
  created_at: string
}

export interface GithubPullSummary {
  number: number
  title: string
  state: string
  user?: { login?: string } | null
  base: { ref: string }
  head: { ref: string }
  created_at: string
  updated_at: string
  draft?: boolean
}

export interface GithubPullFile {
  filename: string
  status: string
  additions: number
  deletions: number
}

export interface GithubIssue {
  title: string
  body: string | null
  state: string
  labels?: Array<string | { name?: string | null }>
  user?: { login?: string } | null
  created_at: string
}

export interface GithubIssueSummary {
  number: number
  title: string
  state: string
  labels?: Array<string | { name?: string | null }>
  user?: { login?: string } | null
  assignee?: { login?: string } | null
  created_at: string
  updated_at: string
  pull_request?: unknown
}

export interface GithubComment {
  user?: { login?: string } | null
  body?: string | null
}

export interface GithubCommitFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

export interface GithubCommit {
  sha: string
  commit: { message: string; author?: { name?: string | null } | null }
  files?: GithubCommitFile[]
}

export type GithubContent =
  | { type: 'file'; path: string; content: string; size: number; encoding?: string }
  | { type: string; path?: string }
  | Array<unknown>

export interface GithubCodeSearch {
  total_count: number
  items: Array<{ path: string; name: string }>
}

export interface GithubWorkflowRun {
  id: number
  name?: string | null
  head_branch: string | null
  head_sha: string
  status: string | null
  conclusion: string | null
  run_attempt?: number
  html_url: string
  created_at: string
  updated_at: string
  jobs_url: string
  logs_url: string
  event?: string
}

export interface GithubWorkflowRunList {
  total_count: number
  workflow_runs: GithubWorkflowRun[]
}

export interface GithubWorkflowRunJobStep {
  name: string
  status: string
  conclusion: string | null
  number: number
  started_at?: string | null
  completed_at?: string | null
}

export interface GithubWorkflowRunJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
  steps?: GithubWorkflowRunJobStep[]
}

export interface GithubWorkflowRunJobList {
  total_count: number
  jobs: GithubWorkflowRunJob[]
}

export interface GithubRepo {
  name: string
  full_name: string
  default_branch: string
  language: string | null
  topics?: string[]
  private: boolean
  archived: boolean
  pushed_at: string | null
  size: number
  stargazers_count: number
  open_issues_count: number
}

export interface GithubBranch {
  name: string
  protected: boolean
  commit: { sha: string; url?: string }
}

export interface GithubCheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
  head_sha: string
  html_url?: string | null
}

export interface GithubArtifact {
  id: number
  name: string
  size_in_bytes: number
  expired: boolean
  archive_download_url: string
}

export interface GithubRepoSecretSummary {
  name: string
  created_at: string
  updated_at: string
}

/**
 * Compact response shape for `pulls.create`. Only the fields the
 * `create_pull_request` op surfaces back to callers — the actual GitHub
 * payload carries dozens more.
 */
export interface GithubPullRefSummary {
  number: number
  html_url: string
  state: string
}

/**
 * Compact response shape shared by `issues.create` and `issues.update`.
 */
export interface GithubIssueRefSummary {
  number: number
  html_url: string
  state: string
}

/**
 * Response shape for `pulls.requestReviewers`. GitHub returns the full PR
 * object plus the resolved reviewer arrays; we only need the latter two.
 */
export interface GithubReviewersResponse {
  requested_reviewers?: Array<{ login?: string | null }> | null
  requested_teams?: Array<{ slug?: string | null }> | null
}

/**
 * Response shape for `repos.createCommitStatus`. GitHub returns the full
 * status object; we only surface id, html_url (if present), and state.
 */
export interface GithubCommitStatus {
  id: number
  state: string
  target_url?: string | null
  description?: string | null
  context?: string | null
}

export interface GithubCreateOrUpdateFileResponse {
  commit: { sha: string; html_url?: string | null }
  content: { sha: string; html_url?: string | null; path?: string } | null
}

export interface GithubGitRef {
  ref: string
  url: string
  object: { sha: string; type?: string; url?: string }
}

export interface GithubMergePullRequest {
  sha: string
  merged: boolean
  message: string
}

export type RepoMonitoredCheck = (fullName: string) => Promise<boolean>

let adapter: GithubAdapter | null = null
let repoMonitored: RepoMonitoredCheck | null = null

export function setGithubAdapter(a: GithubAdapter): void {
  adapter = a
}

export function getGithubAdapter(): GithubAdapter {
  if (!adapter) {
    throw new Error('GithubAdapter is not configured. Call setGithubAdapter() at boot.')
  }
  return adapter
}

export function setRepoMonitoredCheck(check: RepoMonitoredCheck): void {
  repoMonitored = check
}

export function getRepoMonitoredCheck(): RepoMonitoredCheck {
  if (!repoMonitored) {
    throw new Error('RepoMonitoredCheck is not configured. Call setRepoMonitoredCheck() at boot.')
  }
  return repoMonitored
}
