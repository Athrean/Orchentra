import { tool } from 'ai'
import { z } from 'zod'
import { getOctokit } from '../../github/octokit'
import { config } from '../../config'
import { isRepoMonitored } from '../../lib/repo-cache'

const MAX_BODY_CHARS = 6000

const KIND_HEADERS = {
  progress: '## Orchentra Triage Update',
  final: '## Orchentra Triage Results',
  note: '## Orchentra Triage Note',
} as const

export const postCommentTool = tool({
  description:
    'Post a follow-up comment to a GitHub pull request when reasoning warrants reaching out — progress updates, partial findings, ' +
    'or asking the PR author for a reproduction step. Use sparingly: every call writes a public comment on the PR. ' +
    'The repository must be monitored by this org and config.github.comments_enabled must be true.',
  parameters: z.object({
    owner: z.string().describe('Repository owner (login or org).'),
    repo: z.string().describe('Repository name.'),
    prNumber: z.number().int().positive().describe('Pull request number to comment on.'),
    body: z
      .string()
      .min(1)
      .max(MAX_BODY_CHARS)
      .describe(`Markdown comment body. Capped at ${MAX_BODY_CHARS} characters.`),
    kind: z
      .enum(['progress', 'final', 'note'])
      .describe(
        "Comment classification. 'progress' for interim updates, 'final' for closing summaries, 'note' for incidental remarks.",
      ),
  }),
  execute: async ({ owner, repo, prNumber, body, kind }) => {
    if (!config.github.comments_enabled) {
      return { error: 'Comment posting is disabled (config.github.comments_enabled is false).' }
    }

    const fullName = `${owner}/${repo}`
    if (!(await isRepoMonitored(fullName))) {
      return { error: `Repository ${fullName} is not monitored.` }
    }

    const composed = [KIND_HEADERS[kind], '', body.slice(0, MAX_BODY_CHARS)].join('\n')

    try {
      const { data } = await getOctokit().issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: composed,
      })
      return { commentId: data.id, commentUrl: data.html_url }
    } catch (err) {
      return { error: `Failed to post comment: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
})
