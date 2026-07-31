/**
 * Resolve the GitHub owner/repo for the current working directory by
 * parsing `git remote get-url origin`. Both SSH and HTTPS forms — with
 * or without the `.git` suffix — are recognized. Non-GitHub remotes
 * (gitlab, bitbucket, internal hosts) return null, as does the absence
 * of an origin remote or a non-git directory.
 *
 * Used by `orchentra init` to default the install owner without forcing
 * the user to pass `--owner=<o>`, and by the incident prereq check to
 * tell the user where they are when their config is missing.
 */

import { gitOutput } from '@orchentra/cli-core'

export interface GitHubRepo {
  readonly owner: string
  readonly repo: string
}

const SSH_SCP_PATTERN = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/
const SSH_URL_PATTERN = /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/
const HTTPS_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/

export function parseGitHubRemote(url: string): GitHubRepo | null {
  const trimmed = url.trim()
  if (trimmed.length === 0) return null
  for (const pattern of [SSH_SCP_PATTERN, SSH_URL_PATTERN, HTTPS_PATTERN]) {
    const match = trimmed.match(pattern)
    if (match) return { owner: match[1], repo: match[2] }
  }
  return null
}

export function inferGitHubOwner(cwd: string): GitHubRepo | null {
  // gitOutput scrubs GIT_* from the child env: GIT_DIR / GIT_WORK_TREE in the
  // inherited environment override `cwd` for any child git process, so a probe
  // run from inside another git operation (e.g. a husky pre-commit hook for
  // tests) would otherwise resolve the *outer* worktree's origin.
  const url = gitOutput(cwd, ['remote', 'get-url', 'origin'])
  if (!url) return null
  return parseGitHubRemote(url)
}
