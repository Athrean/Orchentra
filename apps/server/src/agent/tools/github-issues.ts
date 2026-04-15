import { tool } from 'ai'
import { z } from 'zod'
import { Octokit } from '@octokit/rest'
import { config } from '../../config'
import { isRepoMonitored } from '../../lib/repo-cache'

const octokit = new Octokit({ auth: config.github.token })

const MAX_COMMENTS = 10
const MAX_BODY_CHARS = 3000

export const getPullRequestTool = tool({
  description:
    'Fetch details of a GitHub pull request including title, body, files changed, and review comments. ' +
    'Useful when a CI failure might be related to a recent PR or when reviewing the fix PR.',
  parameters: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    number: z.number().describe('Pull request number'),
  }),
  execute: async ({ owner, repo, number: prNumber }) => {
    const fullName = `${owner}/${repo}`
    if (!(await isRepoMonitored(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const [prResult, filesResult, commentsResult] = await Promise.all([
        octokit.pulls.get({ owner, repo, pull_number: prNumber }),
        octokit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 20 }),
        octokit.issues.listComments({ owner, repo, issue_number: prNumber, per_page: MAX_COMMENTS }),
      ])

      const pr = prResult.data
      const truncatedBody = pr.body ? pr.body.slice(0, MAX_BODY_CHARS) : null

      const files = filesResult.data.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      }))

      const comments = commentsResult.data.map((c) => ({
        user: c.user?.login,
        body: c.body?.slice(0, 500),
      }))

      return {
        title: pr.title,
        body: truncatedBody,
        state: pr.state,
        merged: pr.merged,
        user: pr.user?.login,
        base: pr.base.ref,
        head: pr.head.ref,
        files,
        comments,
        createdAt: pr.created_at,
      }
    } catch (err) {
      return { error: `Failed to fetch PR: ${err instanceof Error ? err.message : String(err)}` }
    }
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
        octokit.issues.get({ owner, repo, issue_number: issueNumber }),
        octokit.issues.listComments({ owner, repo, issue_number: issueNumber, per_page: MAX_COMMENTS }),
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
    'Search for code in the repository. Returns matching file paths and text snippets. ' +
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
      const { data } = await octokit.search.code({
        q: `${query} repo:${owner}/${repo}`,
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
