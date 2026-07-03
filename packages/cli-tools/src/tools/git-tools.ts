import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

// 30KB output ceiling per call; raise if an agent legitimately needs fuller
// diffs (rare — it can scope with `path`).
const MAX_OUTPUT_BYTES = 30_000

interface GitRun {
  stdout: string
  stderr: string
  exitCode: number
}

async function runGit(args: string[], cwd: string): Promise<GitRun> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', env: cleanGitEnv() })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  await proc.exited
  return { stdout, stderr, exitCode: proc.exitCode ?? 0 }
}

function cleanGitEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('GIT_')) env[key] = value
  }
  return env
}

function cap(text: string): string {
  if (text.length <= MAX_OUTPUT_BYTES) return text
  return text.slice(0, MAX_OUTPUT_BYTES) + `\n… (truncated at ${MAX_OUTPUT_BYTES} bytes)`
}

// `git` exits non-zero outside a repo (and on bad args); surface stderr as the
// error content so the agent gets the real reason instead of a generic failure.
function gitError(run: GitRun): ToolResult {
  return { content: run.stderr.trim() || `git exited with code ${run.exitCode}`, isError: true }
}

export const gitStatusTool: ToolDefinition = {
  name: 'git_status',
  description:
    'Show the working-tree status (current branch, ahead/behind, staged/unstaged/untracked files). Read-only.',
  level: 'read',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute(_args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const run = await runGit(['status', '--branch', '--porcelain=v1'], ctx.cwd)
    if (run.exitCode !== 0) return gitError(run)
    const lines = run.stdout.split('\n')
    const branch = lines[0]?.replace(/^## /, '') ?? ''
    const changes = lines.slice(1).filter((l) => l.trim().length > 0)
    const body = changes.length === 0 ? 'working tree clean' : changes.join('\n')
    return { content: cap(`branch: ${branch}\n${body}`), isError: false }
  },
}

interface DiffInput {
  path?: string
  staged?: boolean
}

export const gitDiffTool: ToolDefinition = {
  name: 'git_diff',
  description:
    'Show pending changes as a unified diff. `staged: true` diffs the index; `path` scopes to a file or dir. Read-only.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      staged: { type: 'boolean', description: 'Diff staged changes (the index) instead of the working tree.' },
      path: { type: 'string', description: 'Limit the diff to this file or directory.' },
    },
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = (args ?? {}) as DiffInput
    const gitArgs = ['diff']
    if (input.staged) gitArgs.push('--staged')
    if (input.path) gitArgs.push('--', input.path)
    const run = await runGit(gitArgs, ctx.cwd)
    if (run.exitCode !== 0) return gitError(run)
    const out = run.stdout.trim()
    return { content: cap(out.length === 0 ? 'no changes' : out), isError: false }
  },
}

interface LogInput {
  limit?: number
  path?: string
}

export const gitLogTool: ToolDefinition = {
  name: 'git_log',
  description: 'List recent commits (hash, date, author, subject), newest first. Read-only.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max commits to show (default 20, max 100).' },
      path: { type: 'string', description: 'Limit history to commits touching this file or directory.' },
    },
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = (args ?? {}) as LogInput
    const requested = Number.isFinite(input.limit) ? Math.floor(input.limit as number) : 20
    const limit = Math.min(Math.max(requested, 1), 100)
    const gitArgs = ['log', `-n${limit}`, '--pretty=format:%h %ad %an — %s', '--date=short']
    if (input.path) gitArgs.push('--', input.path)
    const run = await runGit(gitArgs, ctx.cwd)
    if (run.exitCode !== 0) return gitError(run)
    const out = run.stdout.trim()
    return { content: cap(out.length === 0 ? 'no commits' : out), isError: false }
  },
}
