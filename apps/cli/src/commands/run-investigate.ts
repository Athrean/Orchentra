import type { PermissionMode } from '@orchentra/cli-core'
import { createCliContext } from '../live-cli-factory'
import { investigate } from './investigate'
import { OrgNotAllowedError } from './org-guard'
import { parseRepoRunSpec } from './spec'

export interface RunInvestigateOptions {
  readonly spec: string
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly cwd: string
}

export async function runInvestigate(options: RunInvestigateOptions): Promise<number> {
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
    const result = await investigate(parsed, { cli: ctx.cli })
    const seconds = (result.elapsedMs / 1000).toFixed(1)
    process.stdout.write(`\nInvestigation complete in ${seconds}s (${result.failingJobs.length} failing job(s)).\n`)
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
