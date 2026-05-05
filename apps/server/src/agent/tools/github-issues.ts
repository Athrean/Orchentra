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
import { getOctokit } from '../../github/octokit'
import { isRepoMonitored } from '../../lib/repo-cache'

const MAX_COMMENTS = 10
const MAX_BODY_CHARS = 3000

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
  description:
    'Fetch details of a GitHub issue including title, body, labels, and comments. ' +
    'Useful when a CI failure is linked to a known issue or when checking for related bug reports.',
  parameters: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    number: z.number().describe('Issue number'),
  }),
  execute: async ({ owner, repo, number: issueNumber }) => {
    const fullName = `${owner}/${repo}`
    if (!(await isRepoMonitored(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const [issueResult, commentsResult] = await Promise.all([
        getOctokit().issues.get({ owner, repo, issue_number: issueNumber }),
        getOctokit().issues.listComments({ owner, repo, issue_number: issueNumber, per_page: MAX_COMMENTS }),
      ])

      const issue = issueResult.data
      const truncatedBody = issue.body ? issue.body.slice(0, MAX_BODY_CHARS) : null

      const comments = commentsResult.data.map((c) => ({
        user: c.user?.login,
        body: c.body?.slice(0, 500),
      }))

      return {
        title: issue.title,
        body: truncatedBody,
        state: issue.state,
        labels: issue.labels?.map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean),
        user: issue.user?.login,
        comments,
        createdAt: issue.created_at,
      }
    } catch (err) {
      return { error: `Failed to fetch issue: ${err instanceof Error ? err.message : String(err)}` }
    }
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
