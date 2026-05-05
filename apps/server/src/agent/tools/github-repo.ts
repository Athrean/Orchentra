/**
 * Re-export wrapper. Read-scoped op bodies are migrating to @orchentra/operations
 * one at a time; this file keeps the original `tool({...})` shape so existing
 * in-process agent loop callers stay unchanged for one release per the project
 * alias rule.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '@orchentra/operations'
import { getCommitChangesOperation } from '@orchentra/operations/ops/github/get-commit-changes'
import { getOctokit } from '../../github/octokit'
import { isRepoMonitored } from '../../lib/repo-cache'

const MAX_FILE_CHARS = 4000

const localCtx = { remote: false as const, allowedScopes: new Set<'read' | 'write' | 'admin'>(['read']) }

/**
 * Re-bind the operations-package adapters to the live server modules on every
 * call. Doing it per-call (rather than once at module load) makes the wiring
 * resilient to bun:test's mock.module overrides that redefine these modules
 * after this wrapper has already loaded.
 */
function bindOpsAdapters(): void {
  setGithubAdapter(getOctokit() as unknown as GithubAdapter)
  setRepoMonitoredCheck((fullName) => isRepoMonitored(fullName))
}

export const getCommitChangesTool = tool({
  description: getCommitChangesOperation.description,
  parameters: getCommitChangesOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getCommitChangesOperation.handler(localCtx, args)
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
      const { data } = await getOctokit().repos.getContent({ owner, repo, path, ref })
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
