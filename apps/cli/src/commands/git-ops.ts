import { spawnSync } from 'node:child_process'

export interface GitOps {
  currentBranch(): string
  checkout(branch: string, fromBase?: string): void
  hasUncommittedChanges(): boolean
  add(paths: string[]): void
  commit(message: string): void
  push(branch: string, remote?: string): void
  resetHard(ref: string): void
}

export interface GitOpsOptions {
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
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
    return this.runCapture(['status', '--porcelain']).trim().length > 0
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
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr ?? ''}`)
    }
  }

  private runCapture(args: string[]): string {
    const result = spawnSync('git', args, { cwd: this.cwd, env: this.env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr ?? ''}`)
    }
    return typeof result.stdout === 'string' ? result.stdout : ''
  }
}
