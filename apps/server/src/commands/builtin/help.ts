import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'
import { CommandRegistry } from '../registry'

export class HelpCommand implements CommandHandler {
  readonly spec: SlashCommandSpec = {
    name: 'help',
    aliases: ['?'],
    summary: 'List available slash commands',
  }

  constructor(private readonly registry: CommandRegistry) {}

  async *execute(_args: string[], _ctx: CommandContext): AsyncIterable<string> {
    yield 'Commands:\n'
    for (const spec of this.registry.allSpecs()) {
      const hint = spec.argumentHint ? ` ${spec.argumentHint}` : ''
      yield `  /${spec.name}${hint}  ${spec.summary}\n`
    }
  }
}
