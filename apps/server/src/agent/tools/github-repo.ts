import { tool } from 'ai'
import { z } from 'zod'
import type { Octokit as OctokitType } from '@octokit/rest'
import { config } from '../../config'
import { isRepoMonitored } from '../../lib/repo-cache'

async function octokitClient(): Promise<OctokitType> {
  const { Octokit } = await import('@octokit/rest')
  return new Octokit({ auth: config.github.token })
}

const MAX_PATCH_CHARS = 2000
const MAX_FILE_CHARS = 4000

export const getCommitChangesTool = tool({
  description:
    'Fetch the files changed in a specific commit. ' +
    'Returns changed file names, their status (added/modified/removed), and diffs. ' +
    'Use this to understand what code changed before the failure.',
  parameters: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    sha: z.string().describe('The commit SHA to inspect'),
  }),
  execute: async ({ owner, repo, sha }) => {
    const fullName = `${owner}/${repo}`
    if (!(await isRepoMonitored(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await (await octokitClient()).repos.getCommit({ owner, repo, ref: sha })
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
})

export const getFileContentTool = tool({
  description:
    'Read the content of a specific file from the repository. ' +
    'Useful for reading CI workflow YAML files (.github/workflows/), package.json, ' +
    'test configs, Dockerfiles, or any config file relevant to the failure.',
  parameters: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    path: z.string().describe('File path within the repository (e.g. .github/workflows/ci.yml)'),
    ref: z.string().optional().describe('Branch, tag, or commit SHA — omit for default branch'),
  }),
  execute: async ({ owner, repo, path, ref }) => {
    const fullName = `${owner}/${repo}`
    if (!(await isRepoMonitored(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await (await octokitClient()).repos.getContent({ owner, repo, path, ref })
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
})
