import type { GitHubClient } from './octokit'

export type CommitStatusState = 'error' | 'failure' | 'pending' | 'success'

export interface CommitStatusInput {
  readonly sha: string
  readonly state: CommitStatusState
  readonly context: string
  readonly description?: string
  readonly targetUrl?: string
}

export interface CommitStatus {
  readonly id: number
  readonly state: string
  readonly context: string
  readonly description: string | null
  readonly target_url: string | null
}

export async function createCommitStatus(
  client: GitHubClient,
  owner: string,
  repo: string,
  input: CommitStatusInput,
): Promise<CommitStatus> {
  return client.request<CommitStatus>(`/repos/${owner}/${repo}/statuses/${input.sha}`, {
    method: 'POST',
    body: {
      state: input.state,
      context: input.context,
      description: input.description,
      target_url: input.targetUrl,
    },
  })
}
