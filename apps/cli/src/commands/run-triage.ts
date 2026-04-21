import type { PermissionMode } from '@orchentra/cli-core'
import { OrgNotAllowedError } from './org-guard'
import { parseRepoRunSpec } from './spec'
import { triage } from './triage'

export interface RunTriageOptions {
  readonly spec: string
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly cwd: string
}

export async function runTriage(options: RunTriageOptions): Promise<number> {
  let parsed
  try {
    parsed = parseRepoRunSpec(options.spec)
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  try {
    const result = await triage(parsed)
    process.stdout.write(`\nTriage posted.\n`)
    process.stdout.write(`  Status: ${result.status.state} (${result.status.context})\n`)
    process.stdout.write(`  Check:  #${result.check.id} (${result.check.conclusion ?? result.check.status})\n`)
    if (result.comment && result.pullRequest) {
      process.stdout.write(`  PR:     ${result.pullRequest.html_url} (comment ${result.comment.id})\n`)
    }
    return 0
  } catch (err) {
    if (err instanceof OrgNotAllowedError) {
      process.stderr.write(`error: ${err.message}\n`)
      return 2
    }
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }
}
