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
  const res = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
    cwd,
    // GIT_DIR / GIT_WORK_TREE in the inherited env override `cwd` for
    // any child git process. That bites when orchentra is invoked from
    // inside another git operation (e.g. a husky pre-commit hook for
    // tests) — the probe would resolve the *outer* worktree's origin
    // instead of `cwd`'s. Strip git env vars so `cwd` is authoritative.
    env: gitFreeEnv(),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (res.exitCode !== 0) return null
  const url = new TextDecoder().decode(res.stdout).trim()
  if (url.length === 0) return null
  return parseGitHubRemote(url)
}

function gitFreeEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (key.startsWith('GIT_')) continue
    out[key] = value
  }
  return out
}
