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

export interface GitHubRepo {
  readonly owner: string
  readonly repo: string
}

const SSH_PATTERN = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/
const HTTPS_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/

export function parseGitHubRemote(url: string): GitHubRepo | null {
  const trimmed = url.trim()
  if (trimmed.length === 0) return null
  const ssh = trimmed.match(SSH_PATTERN)
  if (ssh) return { owner: ssh[1], repo: ssh[2] }
  const https = trimmed.match(HTTPS_PATTERN)
  if (https) return { owner: https[1], repo: https[2] }
  return null
}

export function inferGitHubOwner(cwd: string): GitHubRepo | null {
  const res = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (res.exitCode !== 0) return null
  const url = new TextDecoder().decode(res.stdout).trim()
  if (url.length === 0) return null
  return parseGitHubRemote(url)
}
