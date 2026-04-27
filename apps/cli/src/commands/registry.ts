import type { SessionControl } from '@orchentra/cli-core'
import type { UiSink } from './ui-output'

export interface SlashCommandSpec {
  name: string
  aliases: string[]
  summary: string
  argumentHint?: string
}

export interface CommandContext {
  cwd: string
  session: SessionControl
  /**
   * Structured UI sink. Handlers should emit cards/notes/text here when
   * available; the TUI renders them as styled transcript rows. When absent
   * (e.g. one-shot CLI mode), handlers can fall back to stdout.
   */
  ui?: UiSink
}

export interface CommandHandler {
  spec: SlashCommandSpec
  execute(args: string[], ctx: CommandContext): Promise<boolean>
}

export class CommandRegistry {
  private handlers: Map<string, CommandHandler> = new Map()

  register(handler: CommandHandler): void {
    this.handlers.set(handler.spec.name, handler)
    for (const alias of handler.spec.aliases) {
      this.handlers.set(alias, handler)
    }
  }

  resolve(input: string): { handler: CommandHandler; args: string[] } | null | Error {
    if (!input.startsWith('/')) return null
    const parts = input.trim().split(/\s+/)
    const commandPart = parts[0].slice(1)
    if (commandPart.length === 0) return null
    const handler = this.handlers.get(commandPart)
    if (!handler) return new Error(`unknown command: /${commandPart}`)
    return { handler, args: parts.slice(1) }
  }

  allSpecs(): SlashCommandSpec[] {
    const seen = new Set<string>()
    const specs: SlashCommandSpec[] = []
    for (const handler of Array.from(new Set(this.handlers.values()))) {
      if (!seen.has(handler.spec.name)) {
        specs.push(handler.spec)
        seen.add(handler.spec.name)
      }
    }
    return specs.sort((a, b) => a.name.localeCompare(b.name))
  }
}
