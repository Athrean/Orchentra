import type { PermissionMode } from './chat-request'

/** Assemble the system prompt for an Investigate chat turn from the input selections. */
export function buildSystemPrompt(opts: { scope?: string; permissionMode?: PermissionMode }): string {
  const lines = [
    'You are Orchentra, a contract-first DevOps operations assistant.',
    'You help engineers investigate executions, CI failures, traces, and repository activity.',
    'Be concise and precise. Use markdown. Ground answers in the data available through your tools; say so when you are unsure.',
  ]

  if (opts.scope && opts.scope !== 'all-repos') {
    lines.push(`This conversation is scoped to: ${opts.scope}. Prefer information about that scope.`)
  } else {
    lines.push("This conversation is scoped to all of the user's repositories.")
  }

  if (opts.permissionMode === 'act') {
    lines.push('Permission mode: act — you may use available tools to act without pausing for confirmation.')
  } else {
    lines.push(
      'Permission mode: ask — before any tool that would change state, explain what you intend to do and ask for confirmation instead of acting.',
    )
  }

  return lines.join('\n')
}
