import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
})

type Params = z.infer<typeof parameters>

export const getRepoMetadataOperation: Operation<Params, unknown> = {
  id: 'get_repo_metadata',
  description:
    'Fetch repository-level metadata: name, default branch, primary + per-language byte counts, topics, ' +
    'visibility, archive state, last push, size, star count, open-issues count. Useful as the first call when ' +
    'an agent needs orientation about a repo it has not seen before.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'get_repo_metadata' },
  handler: async (_ctx, { owner, repo }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const adapter = getGithubAdapter()
      const [repoResult, languagesResult, topicsResult] = await Promise.all([
        adapter.repos.get({ owner, repo }),
        adapter.repos.listLanguages({ owner, repo }),
        adapter.repos.getAllTopics({ owner, repo }),
      ])
      const r = repoResult.data
      return {
        name: r.name,
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        language: r.language,
        languages: languagesResult.data,
        topics: topicsResult.data.names,
        private: r.private,
        archived: r.archived,
        pushedAt: r.pushed_at,
        size: r.size,
        stargazersCount: r.stargazers_count,
        openIssuesCount: r.open_issues_count,
      }
    } catch (err) {
      return { error: `Failed to fetch repo metadata: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
