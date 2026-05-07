import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const DEFAULT_PER_PAGE = 100
const MAX_PER_PAGE = 100

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  perPage: z
    .number()
    .int()
    .positive()
    .max(MAX_PER_PAGE)
    .optional()
    .describe(`Page size (default: ${DEFAULT_PER_PAGE}, max: ${MAX_PER_PAGE})`),
})

type Params = z.infer<typeof parameters>

export interface ListRepoSecretsResult {
  totalCount: number
  // Names + timestamps only. Values are NEVER returned by the GitHub API or
  // surfaced here. The op exists explicitly to audit what is configured.
  secrets: Array<{ name: string; createdAt: string; updatedAt: string }>
}

export interface ListRepoSecretsError {
  error: string
}

export const listRepoSecretsOperation: Operation<Params, ListRepoSecretsResult | ListRepoSecretsError> = {
  id: 'list_repo_secrets',
  description:
    'List GitHub Actions secret names for a repository with their last-updated timestamp. ' +
    'Values are never returned — this op exists to audit what is configured.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'list_repo_secrets' },
  handler: async (_ctx, { owner, repo, perPage }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().actions.listRepoSecrets({
        owner,
        repo,
        per_page: perPage ?? DEFAULT_PER_PAGE,
      })
      return {
        totalCount: data.total_count,
        secrets: data.secrets.map((s) => ({ name: s.name, createdAt: s.created_at, updatedAt: s.updated_at })),
      }
    } catch (err) {
      return { error: `Failed to list repo secrets: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
