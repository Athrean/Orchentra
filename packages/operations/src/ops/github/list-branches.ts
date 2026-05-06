import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const DEFAULT_PER_PAGE = 30
const MAX_PER_PAGE = 100

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  protected: z.boolean().optional().describe('When true, only return protected branches; when false, only unprotected'),
  perPage: z
    .number()
    .int()
    .positive()
    .max(MAX_PER_PAGE)
    .optional()
    .describe(`Page size (default: ${DEFAULT_PER_PAGE}, max: ${MAX_PER_PAGE})`),
  page: z.number().int().positive().optional().describe('Page number (default: 1)'),
})

type Params = z.infer<typeof parameters>

export const listBranchesOperation: Operation<Params, unknown> = {
  id: 'list_branches',
  description:
    'List branches in the repository. Each branch reports name, protection state, and head commit sha. ' +
    'Useful when reasoning about which ref to target for further reads (e.g. picking the default branch ' +
    'after get_repo_metadata, or finding short-lived feature branches).',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'list_branches' },
  handler: async (_ctx, { owner, repo, protected: isProtected, perPage, page }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().repos.listBranches({
        owner,
        repo,
        protected: isProtected,
        per_page: perPage ?? DEFAULT_PER_PAGE,
        page,
      })

      const branches = data.map((b) => ({
        name: b.name,
        protected: b.protected,
        sha: b.commit.sha,
      }))

      return { branches }
    } catch (err) {
      return { error: `Failed to list branches: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
