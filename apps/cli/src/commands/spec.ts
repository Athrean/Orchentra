export interface RepoRunSpec {
  readonly owner: string
  readonly repo: string
  readonly runId: number
}

export interface RepoSpec {
  readonly owner: string
  readonly repo: string
}

const REPO_RUN_PATTERN = /^([^/\s]+)\/([^#\s]+)#(\d+)$/
const REPO_PATTERN = /^([^/\s]+)\/([^#\s]+)$/

export function parseRepoRunSpec(input: string): RepoRunSpec {
  const match = REPO_RUN_PATTERN.exec(input.trim())
  if (!match) {
    throw new Error(`invalid spec "${input}". expected format: owner/repo#run-id`)
  }
  const runId = Number(match[3])
  if (!Number.isFinite(runId) || runId <= 0) {
    throw new Error(`invalid run id in "${input}"`)
  }
  return { owner: match[1], repo: match[2], runId }
}

export function parseRepoSpec(input: string): RepoSpec {
  const match = REPO_PATTERN.exec(input.trim())
  if (!match) {
    throw new Error(`invalid repo spec "${input}". expected format: owner/repo`)
  }
  return { owner: match[1], repo: match[2] }
}
