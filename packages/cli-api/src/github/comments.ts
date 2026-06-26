import type { GitHubClient } from './octokit'

export interface IssueComment {
  readonly id: number
  readonly body: string
  readonly html_url: string
}

export interface PullReviewComment {
  readonly id: number
  readonly body: string
  readonly html_url: string
}

export function triageMarker(key: string): string {
  return `<!-- orchentra:triage:${key} -->`
}

export async function listIssueComments(
  client: GitHubClient,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueComment[]> {
  return client.request<IssueComment[]>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    query: { per_page: 100 },
  })
}

export async function listPullReviewComments(
  client: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullReviewComment[]> {
  return client.request<PullReviewComment[]>(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, {
    query: { per_page: 100 },
  })
}

export async function createIssueComment(
  client: GitHubClient,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<IssueComment> {
  return client.request<IssueComment>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: { body },
  })
}

export async function updateIssueComment(
  client: GitHubClient,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<IssueComment> {
  return client.request<IssueComment>(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
    method: 'PATCH',
    body: { body },
  })
}

export async function upsertMarkedComment(
  client: GitHubClient,
  owner: string,
  repo: string,
  issueNumber: number,
  markerKey: string,
  body: string,
): Promise<IssueComment> {
  const marker = triageMarker(markerKey)
  const markedBody = body.includes(marker) ? body : `${marker}\n${body}`

  const comments = await listIssueComments(client, owner, repo, issueNumber)
  const existing = comments.find((c) => c.body.includes(marker))

  if (existing) return updateIssueComment(client, owner, repo, existing.id, markedBody)
  return createIssueComment(client, owner, repo, issueNumber, markedBody)
}
