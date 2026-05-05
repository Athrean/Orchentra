/**
 * Re-export wrapper. Read-scoped op bodies are migrating to @orchentra/operations
 * one at a time; this file keeps the original `tool({...})` shape so existing
 * in-process agent loop callers stay unchanged for one release per the project
 * alias rule.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '@orchentra/operations'
import { getPullRequestOperation } from '@orchentra/operations/ops/github/get-pull-request'
import { getIssueOperation } from '@orchentra/operations/ops/github/get-issue'
import { getOctokit } from '../../github/octokit'
import { isRepoMonitored } from '../../lib/repo-cache'

const localCtx = { remote: false as const, allowedScopes: new Set<'read' | 'write' | 'admin'>(['read']) }

function bindOpsAdapters(): void {
  setGithubAdapter(getOctokit() as unknown as GithubAdapter)
  setRepoMonitoredCheck((fullName) => isRepoMonitored(fullName))
}

export const getPullRequestTool = tool({
  description: getPullRequestOperation.description,
  parameters: getPullRequestOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getPullRequestOperation.handler(localCtx, args)
  },
})

export const getIssueTool = tool({
  description: getIssueOperation.description,
  parameters: getIssueOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getIssueOperation.handler(localCtx, args)
  },
})

export const searchCodeTool = tool({
  description:
    'Search for code in the repository. Returns matching file paths. ' +
    'Useful for finding related test files, imports, or configuration references.',
  parameters: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    query: z.string().describe('Search query — a class name, function name, error message, or code pattern'),
  }),
  execute: async ({ owner, repo, query }) => {
    const fullName = `${owner}/${repo}`
    if (!(await isRepoMonitored(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      // Strip scope qualifiers to prevent cross-repo query injection
      const sanitized = query.replace(/\b(repo|org|user):[^\s]+/g, '').trim()
      const { data } = await getOctokit().search.code({
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
})
