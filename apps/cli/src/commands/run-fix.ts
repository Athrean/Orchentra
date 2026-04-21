import type { PermissionMode } from '@orchentra/cli-core'
import { createCliContext } from '../live-cli-factory'
import { fix } from './fix'
import { ShellGitOps } from './git-ops'
import { OrgNotAllowedError } from './org-guard'
import { parseRepoRunSpec } from './spec'

export interface RunFixOptions {
  readonly spec: string
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly cwd: string
  readonly title?: string
  readonly base?: string
}

export async function runFix(options: RunFixOptions): Promise<number> {
  let parsed
  try {
    parsed = parseRepoRunSpec(options.spec)
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  const ctx = await createCliContext({
    model: options.model,
    permissionMode: options.permissionMode,
    cwd: options.cwd,
  })

  try {
    const git = new ShellGitOps({ cwd: options.cwd })
    const result = await fix(parsed, { base: options.base, title: options.title }, { cli: ctx.cli, git })

    if (!result.changedFiles) {
      process.stdout.write('\nNo fix produced (no files changed).\n')
      return 0
    }
    const verb = result.createdPullRequest ? 'Opened' : 'Updated'
    process.stdout.write(`\n${verb} PR: ${result.pullRequest?.html_url ?? '(unknown)'}\n`)
    return 0
  } catch (err) {
    if (err instanceof OrgNotAllowedError) {
      process.stderr.write(`error: ${err.message}\n`)
      return 2
    }
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  } finally {
    await ctx.close()
  }
}
