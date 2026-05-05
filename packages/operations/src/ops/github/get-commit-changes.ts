import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const MAX_PATCH_CHARS = 2000

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  sha: z.string().describe('The commit SHA to inspect'),
})

type Params = z.infer<typeof parameters>

export const getCommitChangesOperation: Operation<Params, unknown> = {
  id: 'get_commit_changes',
  description:
    'Fetch the files changed in a specific commit. ' +
    'Returns changed file names, their status (added/modified/removed), and diffs. ' +
    'Use this to understand what code changed before the failure.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'get_commit_changes' },
  handler: async (_ctx, { owner, repo, sha }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().repos.getCommit({ owner, repo, ref: sha })
      const files = (data.files ?? []).slice(0, 20).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ? f.patch.slice(0, MAX_PATCH_CHARS) : undefined,
      }))
      return {
        sha: data.sha,
        message: data.commit.message,
        author: data.commit.author?.name,
        files,
        totalChangedFiles: data.files?.length ?? 0,
      }
    } catch (err) {
      return { error: `Failed to fetch commit: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
