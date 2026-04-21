import type { GitHubClient } from './octokit'

export interface PullRequestRef {
  readonly number: number
  readonly title: string
  readonly state: 'open' | 'closed'
  readonly html_url: string
  readonly head: { ref: string; sha: string }
  readonly base: { ref: string; sha: string }
}

export async function listPullsForCommit(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
): Promise<PullRequestRef[]> {
  return client.request<PullRequestRef[]>(`/repos/${owner}/${repo}/commits/${sha}/pulls`, {
    accept: 'application/vnd.github.groot-preview+json',
  })
}

export async function findOpenPullByHead(
  client: GitHubClient,
  owner: string,
  repo: string,
  headBranch: string,
): Promise<PullRequestRef | null> {
  const response = await client.request<PullRequestRef[]>(`/repos/${owner}/${repo}/pulls`, {
    query: { head: `${owner}:${headBranch}`, state: 'open' },
  })
  return response[0] ?? null
}

export interface CreatePullRequestInput {
  readonly title: string
  readonly head: string
  readonly base: string
  readonly body?: string
  readonly draft?: boolean
}

export async function createPullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  input: CreatePullRequestInput,
): Promise<PullRequestRef> {
  return client.request<PullRequestRef>(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: {
      title: input.title,
      head: input.head,
      base: input.base,
      body: input.body,
      draft: input.draft ?? false,
    },
  })
}

export async function updatePullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  number: number,
  updates: { title?: string; body?: string },
): Promise<PullRequestRef> {
  return client.request<PullRequestRef>(`/repos/${owner}/${repo}/pulls/${number}`, {
    method: 'PATCH',
    body: updates,
  })
}
