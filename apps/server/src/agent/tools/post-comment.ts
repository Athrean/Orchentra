import { tool } from 'ai'
import { dispatch } from '@orchentra/operations'
import {
  postCommentOp,
  type PostCommentAdapters,
  type PostCommentParams,
} from '@orchentra/operations/ops/github/post-comment'
import { getOctokit } from '../../github/octokit'
import { config } from '../../config'
import { isRepoMonitored } from '../../lib/repo-cache'

/**
 * Construct the host adapters that the operation handler needs.
 *
 * Built lazily per-call so test-time module mocks of `../config`,
 * `../../github/octokit`, and `../../lib/repo-cache` are observed.
 */
function buildAdapters(): PostCommentAdapters {
  return {
    commentsEnabled: () => config.github.comments_enabled,
    isRepoMonitored: (fullName: string) => isRepoMonitored(fullName),
    createComment: async (input) => {
      const { data } = await getOctokit().issues.createComment(input)
      return { id: data.id, html_url: data.html_url }
    },
  }
}

export const postCommentTool = tool({
  description: postCommentOp.description,
  parameters: postCommentOp.parameters,
  execute: async (params: PostCommentParams) => {
    return dispatch(postCommentOp, { remote: false, creds: { postComment: buildAdapters() } }, params)
  },
})

export { postCommentOp }
