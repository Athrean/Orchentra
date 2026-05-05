/**
 * Minimal GitHub adapter contract used by the migrated read-scoped ops.
 * Defined here so the operations package stays self-contained — concrete
 * Octokit wiring lives in the server, which calls setGithubAdapter() at boot.
 */
export interface GithubAdapter {
  pulls: {
    get: (p: { owner: string; repo: string; pull_number: number }) => Promise<{ data: GithubPull }>
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
  }
  issues: {
    get: (p: { owner: string; repo: string; issue_number: number }) => Promise<{ data: GithubIssue }>
    listComments: (p: {
      owner: string
      repo: string
      issue_number: number
      per_page?: number
    }) => Promise<{ data: GithubComment[] }>
  }
  repos: {
    getCommit: (p: { owner: string; repo: string; ref: string }) => Promise<{ data: GithubCommit }>
    getContent: (p: { owner: string; repo: string; path: string; ref?: string }) => Promise<{ data: GithubContent }>
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
  | { type: 'file'; path: string; content: string; size: number }
  | { type: string; path?: string }
  | Array<unknown>

export interface GithubCodeSearch {
  total_count: number
  items: Array<{ path: string; name: string }>
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
