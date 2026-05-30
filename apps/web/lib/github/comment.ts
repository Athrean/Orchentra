import { Octokit } from '@octokit/rest'
import { mintInstallationToken } from './app-jwt'

export interface CommentResult {
  ok: boolean
  url?: string
  error?: string
}

/**
 * Post a comment to a GitHub issue or pull request (PRs are issues for the
 * comments API). Requires the GitHub App to hold `issues: write` (or
 * `pull_requests: write`). Returns `ok: false` with the error instead of
 * throwing, so the chat tool can report an honest failure when the permission
 * is missing rather than appearing to succeed.
 */
export async function postIssueComment(
  installationId: number,
  repoFullName: string,
  issueNumber: number,
  body: string,
): Promise<CommentResult> {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) return { ok: false, error: 'invalid repo' }
  try {
    const token = await mintInstallationToken(installationId)
    const octokit = new Octokit({ auth: token })
    const res = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo,
      issue_number: issueNumber,
      body,
    })
    return { ok: true, url: (res.data as { html_url: string }).html_url }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed to post comment' }
  }
}
