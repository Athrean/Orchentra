import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  path: z.string().describe('File path in the repository (e.g. src/foo.ts).'),
  message: z.string().describe('Commit message for this file change.'),
  content: z.string().describe('Base64-encoded file content.'),
  branch: z.string().optional().describe('Branch to commit to. Defaults to the repo default branch.'),
  sha: z
    .string()
    .optional()
    .describe('Required when updating an existing file — the blob SHA of the file being replaced. Omit to create.'),
})

type Params = z.infer<typeof parameters>

export interface CreateOrUpdateFileContentsResult {
  sha: string
  url: string
}

export interface CreateOrUpdateFileContentsError {
  error: string
}

export const createOrUpdateFileContentsOperation: Operation<
  Params,
  CreateOrUpdateFileContentsResult | CreateOrUpdateFileContentsError
> = {
  id: 'create_or_update_file_contents',
  description:
    'Create or update a single file in a GitHub repository via the Contents API. ' +
    'Pass `sha` when updating an existing file (get it from get_file_content first); omit to create a new file. ' +
    '`content` must be base64-encoded. The repository must be monitored.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'create_or_update_file_contents' },
  handler: async (_ctx, { owner, repo, path, message, content, branch, sha }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content,
        branch,
        sha,
      })
      return {
        sha: data.content?.sha ?? data.commit.sha,
        url: data.content?.html_url ?? data.commit.html_url ?? '',
      }
    } catch (err) {
      return {
        error: `Failed to create or update file contents: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
