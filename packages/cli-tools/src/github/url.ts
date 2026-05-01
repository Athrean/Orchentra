export interface ParsedGitHubUrl {
  owner: string
  repo: string
  kind?: 'issue' | 'pull'
  number?: number
}

const SSH_PATTERN = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/
const HTTPS_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(.+))?\/?$/
const BARE_PATTERN = /^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/

export function parseGitHubUrl(input: string): ParsedGitHubUrl | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const ssh = SSH_PATTERN.exec(trimmed)
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! }

  const https = HTTPS_PATTERN.exec(trimmed)
  if (https) {
    const [, owner, repo, rest] = https
    const base: ParsedGitHubUrl = { owner: owner!, repo: repo! }
    if (!rest) return base
    const segments = rest.split('/').filter(Boolean)
    const [kind, num] = segments
    if ((kind === 'issues' || kind === 'pull') && num && /^\d+$/.test(num)) {
      base.kind = kind === 'issues' ? 'issue' : 'pull'
      base.number = Number(num)
    }
    return base
  }

  if (!trimmed.includes('://')) {
    const bare = BARE_PATTERN.exec(trimmed)
    if (bare) return { owner: bare[1]!, repo: bare[2]! }
  }

  return null
}
