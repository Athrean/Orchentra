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
      const text = value === undefined ? `Key "${key}" not found.` : `${key}: ${JSON.stringify(value, null, 2)}`
      if (ctx.ui) ctx.ui({ kind: 'note', text })
      else process.stdout.write(text + '\n')
      return true
    }

    const memory = fc.memory ?? {}
    const sections = [
      {
        title: 'Session',
        rows: [
          { key: 'model', value: fc.model ?? '(default)' },
          { key: 'permissionMode', value: fc.permissionMode ?? '(default)' },
        ],
      },
      {
        title: 'Memory',
        rows: [
          { key: 'enabled', value: String(memory.enabled ?? true) },
          { key: 'similarityThreshold', value: String(memory.similarityThreshold ?? 0.78) },
          { key: 'embeddingModel', value: memory.embeddingModel ?? 'text-embedding-3-small' },
        ],
      },
    ]

    if (ctx.ui) {
      ctx.ui({ kind: 'card', title: 'Config', sections })
      return true
    }

    const lines: string[] = ['Config']
    for (const s of sections) {
      lines.push('', s.title)
      const w = Math.max(...s.rows.map((r) => r.key.length))
      for (const r of s.rows) lines.push(`  ${r.key.padEnd(w)}  ${r.value}`)
    }
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}
