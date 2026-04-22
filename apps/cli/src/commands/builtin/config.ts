import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { ConfigLoader } from '@orchentra/cli-core'

export class ConfigCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'config',
    aliases: [],
    summary: 'Show current configuration',
    argumentHint: '[get <key>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const config = ConfigLoader.defaultFor(ctx.cwd).load()
    const fc = config.featureConfig

    if (args[0] === 'get' && args[1]) {
      const key = args[1]
      const value = (fc as unknown as Record<string, unknown>)[key]
      if (value === undefined) {
        process.stdout.write(`Key "${key}" not found.\n`)
      } else {
        process.stdout.write(`${key}: ${JSON.stringify(value, null, 2)}\n`)
      }
      return true
    }

    const lines = [
      `model: ${fc.model ?? '(default)'}`,
      `permissionMode: ${fc.permissionMode ?? '(default)'}`,
      `memory.enabled: ${fc.memory?.enabled ?? true}`,
      `memory.similarityThreshold: ${fc.memory?.similarityThreshold ?? 0.78}`,
      `memory.embeddingModel: ${fc.memory?.embeddingModel ?? 'text-embedding-3-small'}`,
    ]
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}
