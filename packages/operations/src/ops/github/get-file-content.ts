import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const MAX_FILE_CHARS = 4000

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  path: z.string().describe('File path within the repository (e.g. .github/workflows/ci.yml)'),
  ref: z.string().optional().describe('Branch, tag, or commit SHA — omit for default branch'),
})

type Params = z.infer<typeof parameters>

export const getFileContentOperation: Operation<Params, unknown> = {
  id: 'get_file_content',
  description:
    'Read the content of a specific file from the repository. ' +
    'Useful for reading CI workflow YAML files (.github/workflows/), package.json, ' +
    'test configs, Dockerfiles, or any config file relevant to the failure.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'get_file_content' },
  handler: async (_ctx, { owner, repo, path, ref }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().repos.getContent({ owner, repo, path, ref })
      if (Array.isArray(data)) {
        return { error: 'Path is a directory — specify a file path' }
      }
      if (data.type !== 'file' || !('content' in data)) {
        return { error: 'Not a readable file' }
      }
      const content = Buffer.from(data.content, 'base64').toString('utf-8')
      const truncated = content.length > MAX_FILE_CHARS
      return {
        path: data.path,
        content: truncated ? content.slice(0, MAX_FILE_CHARS) + '\n... [truncated]' : content,
        truncated,
        size: data.size,
      }
    } catch (err) {
      return { error: `Failed to fetch file: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
