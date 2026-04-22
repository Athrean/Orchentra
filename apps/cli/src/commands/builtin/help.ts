import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { CommandRegistry } from '../registry'

export class HelpCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'help',
    aliases: ['?'],
    summary: 'Show available slash commands',
  }

  private registry: CommandRegistry

  constructor(registry: CommandRegistry) {
    this.registry = registry
  }

  async execute(_args: string[], _ctx: CommandContext): Promise<boolean> {
    const specs = this.registry.allSpecs()
    const maxName = Math.max(...specs.map((s) => s.name.length))
    const lines = specs.map((s) => {
      const padded = s.name.padEnd(maxName)
      const hint = s.argumentHint ? ` ${s.argumentHint}` : ''
      const aliases = s.aliases.length > 0 ? ` (${s.aliases.join(', ')})` : ''
      return `  /${padded}${hint}  ${s.summary}${aliases}`
    })
    process.stdout.write(`\nCommands:\n${lines.join('\n')}\n\n`)
    return true
  }
}
