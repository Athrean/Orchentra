import { createHash } from 'node:crypto'
import { getGitHubToken } from './auth'

const GITHUB_API = 'https://api.github.com'

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

interface RateLimitState {
  remaining: number
  resetAt: number
}

export interface WorkflowRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  headSha: string
  headBranch: string
  event: string
  createdAt: string
  updatedAt: string
  htmlUrl: string
  repository: { fullName: string }
}

export interface WorkflowJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string
  completedAt: string
  steps: WorkflowStep[]
}

export interface WorkflowStep {
  name: string
  status: string
  conclusion: string | null
  number: number
}

export interface PullRequest {
  number: number
  title: string
  body: string | null
  state: string
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  htmlUrl: string
}

export interface CheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  output: { title: string; summary: string }
}

export class GitHubClient {
  private token: string | null = null
  private rateLimit: RateLimitState = { remaining: 5000, resetAt: 0 }

  async ensureToken(): Promise<void> {
    if (!this.token) {
      this.token = await getGitHubToken()
    }
  }

  async getWorkflowRun(owner: string, repo: string, runId: number): Promise<WorkflowRun> {
    const data = await this.request(`/repos/${owner}/${repo}/actions/runs/${runId}`)
    return data as WorkflowRun
  }

  async getWorkflowJobs(owner: string, repo: string, runId: number): Promise<WorkflowJob[]> {
    const data = await this.request(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`)
    return (data as { jobs: WorkflowJob[] }).jobs
  }

  async getJobLog(owner: string, repo: string, jobId: number): Promise<string> {
    const res = await this.rawRequest('GET', `/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`)
    if (res.status === 302 || res.status >= 300) {
      const redirectUrl = res.headers.get('location')
      if (redirectUrl) {
        const logRes = await fetch(redirectUrl)
        return logRes.text()
      }
    }
    return res.text()
  }

  async createCheckRun(
    owner: string,
    repo: string,
    sha: string,
    params: {
      name: string
      status: 'queued' | 'in_progress' | 'completed'
      conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required'
      output?: { title: string; summary: string }
    },
  ): Promise<CheckRun> {
    const data = await this.request(`/repos/${owner}/${repo}/check-runs`, {
      method: 'POST',
      body: { ...params, head_sha: sha },
    })
    return data as CheckRun
  }

  async listPullRequests(
    owner: string,
    repo: string,
    head?: string,
    base?: string,
    state: string = 'open',
  ): Promise<PullRequest[]> {
    const params = new URLSearchParams({ state })
    if (head) params.set('head', head)
    if (base) params.set('base', base)
    const data = await this.request(`/repos/${owner}/${repo}/pulls?${params}`)
    return data as PullRequest[]
  }

  async createPullRequest(
    owner: string,
    repo: string,
    params: {
      title: string
      body: string
      head: string
      base: string
    },
  ): Promise<PullRequest> {
    const data = await this.request(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: params,
    })
    return data as PullRequest
  }

  async createIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: { body },
    })
  }

  async findExistingPr(
    owner: string,
    repo: string,
    head: string,
    base: string,
    title: string,
  ): Promise<PullRequest | null> {
    const prs = await this.listPullRequests(owner, repo, head, base)
    const titleHash = hashTitle(title)
    for (const pr of prs) {
      const prHash = pr.body?.match(/\[orchentra:id:([a-f0-9]+)\]/)?.[1]
      if (prHash === titleHash) return pr
    }
    return null
  }

  async createIdempotentPr(
    owner: string,
    repo: string,
    params: {
      title: string
      body: string
      head: string
      base: string
    },
  ): Promise<PullRequest> {
    const existing = await this.findExistingPr(owner, repo, params.head, params.base, params.title)
    if (existing) return existing

    const titleHash = hashTitle(params.title)
    const bodyWithMarker = `${params.body}\n\n---\n[orchentra:id:${titleHash}]`
    return this.createPullRequest(owner, repo, { ...params, body: bodyWithMarker })
  }

  async createCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    params: {
      state: 'pending' | 'success' | 'failure' | 'error'
      targetUrl?: string
      description?: string
      context?: string
    },
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/statuses/${sha}`, {
      method: 'POST',
      body: params,
    })
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.rateLimit.remaining > 0) return
    const waitMs = this.rateLimit.resetAt - Date.now()
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(waitMs, 60_000)))
    }
  }

  private updateRateLimit(headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining')
    const reset = headers.get('x-ratelimit-reset')
    if (remaining) this.rateLimit.remaining = parseInt(remaining, 10)
    if (reset) this.rateLimit.resetAt = parseInt(reset, 10) * 1000
  }

  private async request(path: string, options?: RequestOptions): Promise<unknown> {
    await this.ensureToken()
    const res = await this.rawRequest(options?.method ?? 'GET', path, options)
    this.updateRateLimit(res.headers)

    if (res.status === 403 && this.rateLimit.remaining === 0) {
      await this.waitForRateLimit()
      return this.request(path, options)
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 500)}`)
    }

    return res.json()
  }

  private async rawRequest(method: string, path: string, options?: RequestOptions): Promise<Response> {
    await this.ensureToken()
    const url = path.startsWith('http') ? path : `${GITHUB_API}${path}`
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token!}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })
  }
}

function hashTitle(title: string): string {
  return createHash('sha256').update(title).digest('hex').slice(0, 12)
}
