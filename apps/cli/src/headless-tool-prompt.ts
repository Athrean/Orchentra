import type { AskUser as ToolAskUser, PromptChoice as ToolPromptChoice, PromptRequest } from '@orchentra/cli-core'

export interface HeadlessToolPromptDeps {
  /** Returns true when stdin is attached to a TTY (interactive). */
  readonly isTty: () => boolean
  /** Writes the user-visible numbered prompt body. */
  readonly writePrompt: (text: string) => void
  /** Writes a one-line notice when stdin is non-interactive. */
  readonly writeNotice: (text: string) => void
  /** Reads one line from the user. Resolves with the trimmed text or null on cancel/EOF. */
  readonly readLineRaw: () => Promise<string | null>
}

/**
 * Build the headless (non-TUI) tool-prompt callback. When stdin is not a TTY
 * (CI run, piped input, daemon mode), the prompt would otherwise hang forever
 * waiting on a `read()` against /dev/null. Auto-deny instead and surface a
 * one-line notice so the user can see in logs why the call was blocked.
 */
export function createHeadlessAskToolUser(deps: HeadlessToolPromptDeps): ToolAskUser {
  return async (request: PromptRequest): Promise<ToolPromptChoice> => {
    if (!deps.isTty()) {
      deps.writeNotice(
        `Auto-denied ${request.toolName}: no TTY available to confirm. Pass --yes-to-tool, set permission rules in .orchentra/permissions.json, or run interactively.`,
      )
      return 'deny'
    }
    deps.writePrompt(
      `\nAllow ${request.toolName}? input=${request.inputJson}\n` + '  1) Yes  2) Yes, allow this pattern  3) No\n> ',
    )
    const text = (await deps.readLineRaw())?.trim() ?? ''
    if (text === '1') return 'allow-once'
    if (text === '2') return 'allow-pattern'
    if (text === '3') return 'deny'
    return 'cancel'
  }
}
