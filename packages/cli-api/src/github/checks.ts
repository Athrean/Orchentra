import type { GitHubClient } from './octokit'

export type CheckConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'timed_out'
  | 'action_required'
  | 'skipped'

export interface CreateCheckRunInput {
  readonly name: string
  readonly headSha: string
  readonly status: 'queued' | 'in_progress' | 'completed'
  readonly conclusion?: CheckConclusion
  readonly externalId?: string
  readonly detailsUrl?: string
  readonly output?: {
    readonly title: string
    readonly summary: string
    readonly text?: string
  }
}

export interface CheckRun {
  readonly id: number
  readonly name: string
  readonly external_id: string | null
  readonly head_sha: string
  readonly html_url: string
  readonly status: string
  readonly conclusion: string | null
}

export async function createCheckRun(
  client: GitHubClient,
  owner: string,
  repo: string,
  input: CreateCheckRunInput,
): Promise<CheckRun> {
  return client.request<CheckRun>(`/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    body: {
      name: input.name,
      head_sha: input.headSha,
      status: input.status,
      conclusion: input.conclusion,
      external_id: input.externalId,
      details_url: input.detailsUrl,
      output: input.output,
    },
  })
}

export async function findCheckRunByExternalId(
  client: GitHubClient,
  owner: string,
  repo: string,
  headSha: string,
  externalId: string,
): Promise<CheckRun | null> {
  const response = await client.request<{ check_runs: CheckRun[] }>(
    `/repos/${owner}/${repo}/commits/${headSha}/check-runs`,
    { query: { per_page: 100 } },
  )
  return (response.check_runs ?? []).find((run) => run.external_id === externalId) ?? null
}

export async function updateCheckRun(
  client: GitHubClient,
  owner: string,
  repo: string,
  checkRunId: number,
  input: Omit<CreateCheckRunInput, 'headSha'>,
): Promise<CheckRun> {
  return client.request<CheckRun>(`/repos/${owner}/${repo}/check-runs/${checkRunId}`, {
    method: 'PATCH',
    body: {
      name: input.name,
      status: input.status,
      conclusion: input.conclusion,
      external_id: input.externalId,
      details_url: input.detailsUrl,
      output: input.output,
    },
  })
}

export async function upsertCheckRun(
  client: GitHubClient,
  owner: string,
  repo: string,
  input: CreateCheckRunInput,
): Promise<CheckRun> {
  if (input.externalId) {
    const existing = await findCheckRunByExternalId(client, owner, repo, input.headSha, input.externalId)
    if (existing) {
      return updateCheckRun(client, owner, repo, existing.id, input)
    }
  }
  return createCheckRun(client, owner, repo, input)
}
