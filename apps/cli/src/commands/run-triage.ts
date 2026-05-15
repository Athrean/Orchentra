import type { PermissionMode } from '@orchentra/cli-core'
import { OrgNotAllowedError } from './org-guard'
import { renderNextStepHint } from '../render/next-step-hint'
import { type RepoRunSpec, parseRepoRunSpec } from './spec'
import { triage, type TriageResult } from './triage'

export interface RunTriageOptions {
  readonly spec: string
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly cwd: string
  /**
   * Test-only injection: the GitHub-side triage call. Real callers use the
   * default; tests stub it so they can assert what the success path emits
   * without making network calls.
   */
  readonly triageImpl?: (spec: RepoRunSpec) => Promise<TriageResult>
  /** Test-only injection for stdout. */
  readonly write?: (text: string) => void
  /** Test-only injection for stderr. */
  readonly writeError?: (text: string) => void
}

export async function runTriage(options: RunTriageOptions): Promise<number> {
  // Triage is a GitHub-only operation and does not run the LLM runtime loop,
  // so there is no CLI session context to initialize/persist here.
  const triageCall = options.triageImpl ?? triage
  const write = options.write ?? ((text: string): void => void process.stdout.write(text))
  const writeError = options.writeError ?? ((text: string): void => void process.stderr.write(text))

  let parsed: RepoRunSpec
  try {
    parsed = parseRepoRunSpec(options.spec)
  } catch (err) {
    writeError(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  try {
    const result = await triageCall(parsed)
    write(`\nTriage posted.\n`)
    write(`  Status: ${result.status.state} (${result.status.context})\n`)
    write(`  Check:  #${result.check.id} (${result.check.conclusion ?? result.check.status})\n`)
    if (result.comment && result.pullRequest) {
      write(`  PR:     ${result.pullRequest.html_url} (comment ${result.comment.id})\n`)
    }
    write(`\n${renderNextStepHint({ id: 'triage-completed', runId: parsed.runId })}\n`)
    return 0
  } catch (err) {
    if (err instanceof OrgNotAllowedError) {
      writeError(`error: ${err.message}\n`)
      return 2
    }
    writeError(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }
}
