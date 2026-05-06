/**
 * CLI inline approval prompt for write/destructive ops.
 *
 * Plugs into the operations dispatcher's `ApprovalCallback` slot. When the
 * dispatcher hits the gate locally (e.g. `orchentra <verb>` invoking a
 * write op), this prompt prints op + Zod-decoded input + risk class to
 * stderr, reads y/N from stdin, and times out after a configurable budget
 * (default 5min, ORCHENTRA_APPROVAL_TIMEOUT_MS to override).
 *
 * Esc / Ctrl-C abort and resolve as `denied` so the dispatcher rejects with
 * permission_denied. On non-TTY stdin (CI, piped input), we auto-deny with
 * a one-line notice — same posture as the headless tool prompt.
 *
 * The runner injects this via `OperationContext.approval`. There is no
 * persisted row for CLI flow — the prompt is synchronous within the local
 * process, so the "suspendable" semantics collapse to "block on readLine".
 */

import type { ApprovalCallback, ApprovalCallbackResult } from '@orchentra/operations'
import { resolveTrustClass } from '@orchentra/operations'

export interface CliApprovalPromptDeps {
  isTty: () => boolean
  writePrompt: (text: string) => void
  writeNotice: (text: string) => void
  /** Returns the trimmed line, or null on EOF / cancel / timeout. */
  readLineRaw: (timeoutMs: number) => Promise<string | null>
  /** Override the timeout budget. Default: ORCHENTRA_APPROVAL_TIMEOUT_MS or 5min. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = (() => {
  const raw = process.env.ORCHENTRA_APPROVAL_TIMEOUT_MS
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60 * 1000
})()

export function createCliApprovalCallback(deps: CliApprovalPromptDeps): ApprovalCallback {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return async (op, params): Promise<ApprovalCallbackResult> => {
    if (!deps.isTty()) {
      deps.writeNotice(
        `Auto-denied ${op.id}: no TTY available to confirm. Run interactively or set ORCHENTRA_AUTO_APPROVE=1 in a trusted shell.`,
      )
      return { status: 'denied', reason: 'no TTY available to prompt for approval' }
    }
    const trustClass = resolveTrustClass(op)
    const banner = formatBanner(op.id, trustClass, params)
    deps.writePrompt(banner)
    const text = (await deps.readLineRaw(timeoutMs))?.trim().toLowerCase() ?? null
    if (text === null) {
      return { status: 'denied', reason: 'approval timed out, run again to retry' }
    }
    if (text === 'y' || text === 'yes') return { status: 'approved' }
    return { status: 'denied', reason: `user declined approval (entered ${JSON.stringify(text)})` }
  }
}

function formatBanner(opId: string, trustClass: string, params: unknown): string {
  const inputJson = safeJson(params)
  const tag = trustClass === 'destructive' ? 'DESTRUCTIVE' : 'WRITE'
  return [
    '',
    `[${tag}] ${opId}`,
    `  input: ${inputJson}`,
    '  Approve? (y/N) > ',
  ].join('\n')
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2) ?? 'undefined'
    if (json.length <= 600) return json
    return json.slice(0, 600) + '… (truncated)'
  } catch {
    return '<unserializable>'
  }
}
