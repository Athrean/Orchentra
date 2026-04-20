import type { PermissionMode } from '@orchentra/cli-core'
import { CLI_NAME, CLI_VERSION } from './version'

export interface SlashCommandSpec {
  name: string
  aliases: string[]
  summary: string
  argumentHint?: string
}

export type SlashCommand =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'cost' }
  | { kind: 'clear' }
  | { kind: 'model'; model?: string }
  | { kind: 'compact' }
  | { kind: 'diff' }
  | { kind: 'version' }
  | { kind: 'exit' }

export interface CommandContext {
  model: string
  permissionMode: PermissionMode
  sessionId: string
  turns: number
  cwd: string
}

export function slashCommandSpecs(): SlashCommandSpec[] {
  return [
    { name: 'help', aliases: ['?'], summary: 'Show available slash commands' },
    { name: 'status', aliases: [], summary: 'Show model, permission mode, session info' },
    { name: 'cost', aliases: [], summary: 'Show token usage and estimated cost' },
    { name: 'clear', aliases: [], summary: 'Clear conversation history' },
    { name: 'model', aliases: [], summary: 'Show or switch model', argumentHint: '[name]' },
    { name: 'compact', aliases: [], summary: 'Force context compaction' },
    { name: 'diff', aliases: [], summary: 'Show uncommitted changes' },
    { name: 'version', aliases: ['v'], summary: 'Show version' },
    { name: 'exit', aliases: ['quit', 'q'], summary: 'Exit the REPL' },
  ]
}

const COMMAND_KIND_MAP: Record<string, SlashCommand['kind']> = {
  help: 'help',
  status: 'status',
  cost: 'cost',
  clear: 'clear',
  model: 'model',
  compact: 'compact',
  diff: 'diff',
  version: 'version',
  exit: 'exit',
}

export function parseSlashCommand(input: string): SlashCommand | null | Error {
  if (!input.startsWith('/')) {
    return null
  }

  const parts = input.trim().split(/\s+/)
  const commandPart = parts[0].slice(1)
  const args = parts.slice(1)

  if (commandPart.length === 0) {
    return null
  }

  const specs = slashCommandSpecs()
  const matched = specs.find((spec) => spec.name === commandPart || spec.aliases.includes(commandPart))

  if (matched === undefined) {
    return new Error(`unknown command: /${commandPart}`)
  }

  const kind = COMMAND_KIND_MAP[matched.name]

  if (kind === 'model') {
    return { kind, model: args.length > 0 ? args.join(' ') : undefined }
  }

  return { kind }
}

export function renderCommandHelp(): string {
  const specs = slashCommandSpecs()
  const lines: string[] = []
  lines.push(`Slash commands (${CLI_NAME} REPL):`)
  lines.push('')

  for (const spec of specs) {
    const aliases = spec.aliases.length > 0 ? spec.aliases.map((a) => `/${a}`).join(', ') : ''
    const argHint = spec.argumentHint ?? ''
    const commandLabel = `/${spec.name}${argHint ? ' ' + argHint : ''}`
    const aliasLabel = aliases.length > 0 ? ` (${aliases})` : ''
    lines.push(`  ${commandLabel.padEnd(20)}${spec.summary}${aliasLabel}`)
  }

  return lines.join('\n')
}

export async function dispatchCommand(cmd: SlashCommand, ctx: CommandContext): Promise<boolean> {
  switch (cmd.kind) {
    case 'help':
      console.log(renderCommandHelp())
      return true

    case 'status':
      console.log(`Model:           ${ctx.model}`)
      console.log(`Permission mode: ${ctx.permissionMode}`)
      console.log(`Session ID:      ${ctx.sessionId}`)
      console.log(`Turns:           ${ctx.turns}`)
      console.log(`Working dir:     ${ctx.cwd}`)
      return true

    case 'cost':
      console.log('Cost tracking: not yet available')
      return true

    case 'clear':
      console.log('Conversation cleared')
      return true

    case 'model':
      if (cmd.model !== undefined) {
        console.log(`Switched model to: ${cmd.model}`)
      } else {
        console.log(`Current model: ${ctx.model}`)
      }
      return true

    case 'compact':
      console.log('Compaction forced')
      return true

    case 'diff': {
      const result = Bun.spawnSync(['git', 'diff', '--stat'], {
        cwd: ctx.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const stdout = new TextDecoder().decode(result.stdout)
      const stderr = new TextDecoder().decode(result.stderr)
      if (stdout.length > 0) {
        console.log(stdout.trimEnd())
      }
      if (stderr.length > 0) {
        console.log(stderr.trimEnd())
      }
      return true
    }

    case 'version':
      console.log(`${CLI_NAME} ${CLI_VERSION}`)
      return true

    case 'exit':
      return false
  }
}
