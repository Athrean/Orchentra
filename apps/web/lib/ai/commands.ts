/**
 * Slash commands for the chat composer — the Triage "action layer" inside the
 * chat box. Selecting one inserts a templated prompt that grounds the assistant
 * in real tool data. Commands flagged `requiresAct` perform write-backs to
 * GitHub and are only offered when the chat is in "act" permission mode.
 */
export interface SlashCommand {
  name: string
  description: string
  prompt: string
  requiresAct?: boolean
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'repo-health',
    description: 'Health check across your repositories',
    prompt:
      'Run a repository health check: summarize workflow success rate, recent failures, and any repositories that need attention.',
  },
  {
    name: 'failures',
    description: 'Recent CI failures with root causes',
    prompt:
      'Summarize recent CI failures across my repositories, with the likely root cause and a suggested fix for each.',
  },
  {
    name: 'summarize',
    description: 'Summarize this investigation',
    prompt: 'Summarize this investigation so far: the key findings, the root cause, and the recommended next steps.',
  },
  {
    name: 'open-pr',
    description: 'Draft a pull request for the fix',
    prompt:
      'Draft a pull request that addresses the issue under investigation. Include a title, a description, the target branch, and a checklist of changes.',
  },
  {
    name: 'fix',
    description: 'Propose a concrete fix',
    prompt:
      'Propose a concrete fix for the failure under investigation: the exact change, the affected file(s), and why it resolves the problem.',
  },
  {
    name: 'writeback',
    description: 'Post findings back to GitHub',
    prompt:
      'Post a concise summary of this investigation back to the relevant GitHub issue or pull request as a comment.',
    requiresAct: true,
  },
]

export interface SlashQuery {
  active: boolean
  query: string
}

/** Detect a slash command being typed: a leading '/' with no whitespace yet. */
export function parseSlashQuery(value: string): SlashQuery {
  if (!value.startsWith('/')) return { active: false, query: '' }
  const rest = value.slice(1)
  if (/\s/.test(rest)) return { active: false, query: '' }
  return { active: true, query: rest.toLowerCase() }
}

/** Commands matching the typed query, hiding write commands unless act mode is on. */
export function filterSlashCommands(query: string, allowAct: boolean): SlashCommand[] {
  return SLASH_COMMANDS.filter((command) => allowAct || !command.requiresAct).filter(
    (command) => command.name.includes(query) || command.description.toLowerCase().includes(query),
  )
}
