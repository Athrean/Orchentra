import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  query: z.string().describe('Search query — a class name, function name, error message, or code pattern'),
})

type Params = z.infer<typeof parameters>

export const searchCodeOperation: Operation<Params, unknown> = {
  id: 'search_code',
  description:
    'Search for code in the repository. Returns matching file paths. ' +
    'Useful for finding related test files, imports, or configuration references.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'search_code' },
  handler: async (_ctx, { owner, repo, query }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      // Strip scope qualifiers to prevent cross-repo query injection.
      // The /i flag is required: GitHub's search syntax accepts qualifiers in
      // any case (REPO:, Repo:, repo:), so a case-sensitive regex would let
      // upper-case variants slip through and target a different repo.
      const sanitized = query.replace(/\b(repo|org|user):[^\s]+/gi, '').trim()
      const { data } = await getGithubAdapter().search.code({
        q: `${sanitized} repo:${owner}/${repo}`,
        per_page: 10,
      })

      const results = data.items.map((item) => ({
        path: item.path,
        name: item.name,
      }))

      return {
        total: data.total_count,
        results,
      }
    } catch (err) {
      return { error: `Failed to search code: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
