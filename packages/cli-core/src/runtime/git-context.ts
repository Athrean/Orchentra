export interface GitCommitEntry {
  hash: string
  subject: string
}

export interface GitContext {
  branch?: string
  recentCommits: GitCommitEntry[]
  stagedFiles: string[]
}

const MAX_RECENT_COMMITS = 5

function runGit(cwd: string, args: string[]): string | null {
  try {
    const proc = Bun.spawnSync(['git', ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (!proc.success) return null
    return new TextDecoder().decode(proc.stdout).trim()
  } catch {
    return null
  }
}

function readBranch(cwd: string): string | undefined {
  const output = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!output || output === 'HEAD') return undefined
  return output
}

function readRecentCommits(cwd: string): GitCommitEntry[] {
  const output = runGit(cwd, [
    '--no-optional-locks',
    'log',
    '--oneline',
    '-n',
    String(MAX_RECENT_COMMITS),
    '--no-decorate',
  ])
  if (!output) return []

  return output
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const spaceIdx = line.indexOf(' ')
      if (spaceIdx === -1) return null
      return {
        hash: line.slice(0, spaceIdx),
        subject: line.slice(spaceIdx + 1),
      }
    })
    .filter((e): e is GitCommitEntry => e !== null)
}

function readStagedFiles(cwd: string): string[] {
  const output = runGit(cwd, ['--no-optional-locks', 'diff', '--cached', '--name-only'])
  if (!output) return []
  return output.split('\n').filter((line) => line.trim().length > 0)
}

export function detectGitContext(cwd: string): GitContext | null {
  const check = runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (!check) return null

  return {
    branch: readBranch(cwd),
    recentCommits: readRecentCommits(cwd),
    stagedFiles: readStagedFiles(cwd),
  }
}

export function renderGitContext(ctx: GitContext): string {
  const lines: string[] = []

  if (ctx.branch) {
    lines.push(`Git branch: ${ctx.branch}`)
  }

  if (ctx.recentCommits.length > 0) {
    lines.push('')
    lines.push('Recent commits:')
    for (const entry of ctx.recentCommits) {
      lines.push(`  ${entry.hash} ${entry.subject}`)
    }
  }

  if (ctx.stagedFiles.length > 0) {
    lines.push('')
    lines.push('Staged files:')
    for (const file of ctx.stagedFiles) {
      lines.push(`  ${file}`)
    }
  }

  return lines.join('\n')
}
