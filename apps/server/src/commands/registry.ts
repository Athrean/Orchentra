export interface SlashCommandSpec {
  name: string
  aliases: string[]
  summary: string
  argumentHint?: string
}

export interface CommandContext {
  orgId: string
  userId: string | null
  sessionId: string
}

export interface CommandHandler {
  spec: SlashCommandSpec
  execute(args: string[], ctx: CommandContext): AsyncIterable<string>
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
    const trimmed = input.trim()
    if (!trimmed.startsWith('/')) return null
    const parts = trimmed.split(/\s+/)
    const name = parts[0].slice(1)
    if (name.length === 0) return null
    const handler = this.handlers.get(name)
    if (!handler) return new Error(`unknown command: /${name}`)
    return { handler, args: parts.slice(1) }
  }

  allSpecs(): SlashCommandSpec[] {
    const seen = new Set<CommandHandler>()
    const specs: SlashCommandSpec[] = []
    for (const handler of this.handlers.values()) {
      if (!seen.has(handler)) {
        specs.push(handler.spec)
        seen.add(handler)
      }
    }
    return specs.sort((a, b) => a.name.localeCompare(b.name))
  }
}
