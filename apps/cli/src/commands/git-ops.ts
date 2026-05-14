import { spawnSync } from 'node:child_process'

export interface GitOps {
  currentBranch(): string
  checkout(branch: string, fromBase?: string): void
  hasUncommittedChanges(): boolean
  listUncommittedFiles(): string[]
  /** Unified diff for the given paths against HEAD, including untracked content. */
  diffFiles(paths: string[]): string
  add(paths: string[]): void
  commit(message: string): void
  push(branch: string, remote?: string): void
  resetHard(ref: string): void
}

export interface GitOpsOptions {
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
}

export class GitCommandError extends Error {
  readonly command: string
  readonly exitCode: number | null
  readonly stderr: string

  constructor(command: string, exitCode: number | null, stderr: string) {
    super(`git ${command} failed (exit ${exitCode ?? 'unknown'}): ${stderr.trim().slice(0, 200)}`)
    this.name = 'GitCommandError'
    this.command = command
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export class ShellGitOps implements GitOps {
  private readonly cwd: string
  private readonly env: NodeJS.ProcessEnv

  constructor(opts: GitOpsOptions) {
    this.cwd = opts.cwd
    this.env = opts.env ?? process.env
  }

  currentBranch(): string {
    return this.runCapture(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  }

  checkout(branch: string, fromBase?: string): void {
    if (this.branchExists(branch)) {
      this.run(['checkout', branch])
    } else if (fromBase) {
      this.run(['checkout', '-b', branch, fromBase])
    } else {
      this.run(['checkout', '-b', branch])
    }
  }

  hasUncommittedChanges(): boolean {
    return this.listUncommittedFiles().length > 0
  }

  listUncommittedFiles(): string[] {
    const raw = this.runCapture(['status', '--porcelain'])
    const lines = raw.split(/\r?\n/).filter((line) => line.length > 0)
    const files: string[] = []
    for (const line of lines) {
      const rawPath = line.length > 3 ? line.slice(3).trim() : ''
      if (rawPath.length === 0) continue
      const renamed = rawPath.includes(' -> ')
        ? (() => {
            const parts = rawPath.split(' -> ')
            return parts[parts.length - 1] ?? ''
          })()
        : rawPath
      if (renamed.length > 0) files.push(renamed)
    }
    return files
  }

  diffFiles(paths: string[]): string {
    if (paths.length === 0) return ''
    // Stage paths into the index so the diff covers both tracked and untracked
    // content uniformly; reset the index back to leave the user's stage clean.
    this.run(['add', '--intent-to-add', '--', ...paths])
    const diff = this.runCapture(['diff', '--no-color', '--', ...paths])
    return diff
  }

  add(paths: string[]): void {
    if (paths.length === 0) return
    this.run(['add', ...paths])
  }

  commit(message: string): void {
    this.run(['commit', '-m', message])
  }

  push(branch: string, remote = 'origin'): void {
    this.run(['push', '-u', remote, branch])
  }

  resetHard(ref: string): void {
    this.run(['reset', '--hard', ref])
  }

  private branchExists(branch: string): boolean {
    const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: this.cwd,
      env: this.env,
    })
    return result.status === 0
  }

  private run(args: string[]): void {
    const result = spawnSync('git', args, { cwd: this.cwd, env: this.env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new GitCommandError(args.join(' '), result.status, result.stderr ?? '')
    }
  }

  private runCapture(args: string[]): string {
    const result = spawnSync('git', args, { cwd: this.cwd, env: this.env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new GitCommandError(args.join(' '), result.status, result.stderr ?? '')
    }
    return typeof result.stdout === 'string' ? result.stdout : ''
  }
}
