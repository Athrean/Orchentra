import { z } from 'zod'
import type { Operation, OperationContext } from '../../types'

const MAX_BODY_CHARS = 6000

const KIND_HEADERS = {
  progress: '## Orchentra Triage Update',
  final: '## Orchentra Triage Results',
  note: '## Orchentra Triage Note',
} as const

const PostCommentParams = z.object({
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
})

export type PostCommentParams = z.infer<typeof PostCommentParams>

export interface PostCommentResult {
  commentId?: number
  commentUrl?: string
  error?: string
}

/**
 * The minimum surface the operation needs from its host. Local CLI callers
 * pass the real `getOctokit()` + `config` + monitored-repo predicate;
 * tests pass fakes. The operation never imports server internals directly.
 */
export interface PostCommentAdapters {
  commentsEnabled: () => boolean
  isRepoMonitored: (fullName: string) => Promise<boolean>
  createComment: (input: {
    owner: string
    repo: string
    issue_number: number
    body: string
  }) => Promise<{ id: number; html_url: string }>
}

interface CredsBag {
  postComment?: PostCommentAdapters
}

function resolveAdapters(ctx: OperationContext): PostCommentAdapters {
  const creds = ctx.creds as CredsBag | undefined
  if (!creds?.postComment) {
    throw new Error('post_comment: no adapters provided on ctx.creds.postComment')
  }
  return creds.postComment
}

export const postCommentOp: Operation<PostCommentParams, PostCommentResult> = {
  id: 'post_comment',
  description:
    'Post a follow-up comment to a GitHub pull request when reasoning warrants reaching out — progress updates, partial findings, ' +
    'or asking the PR author for a reproduction step. Use sparingly: every call writes a public comment on the PR. ' +
    'The repository must be monitored by this org and config.github.comments_enabled must be true.',
  scope: 'write',
  mutating: true,
  localOnly: false,
  parameters: PostCommentParams,
  handler: async (ctx, { owner, repo, prNumber, body, kind }) => {
    const adapters = resolveAdapters(ctx)

    if (!adapters.commentsEnabled()) {
      return { error: 'Comment posting is disabled (config.github.comments_enabled is false).' }
    }

    const fullName = `${owner}/${repo}`
    if (!(await adapters.isRepoMonitored(fullName))) {
      return { error: `Repository ${fullName} is not monitored.` }
    }

    const composed = [KIND_HEADERS[kind], '', body.slice(0, MAX_BODY_CHARS)].join('\n')

    try {
      const data = await adapters.createComment({
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
}
