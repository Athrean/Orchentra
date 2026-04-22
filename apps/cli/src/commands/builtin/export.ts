import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ExportCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'export',
    aliases: [],
    summary: 'Export conversation to markdown or JSON',
    argumentHint: '[--format md|json] [--output <path>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const format = extractFlag(args, '--format') ?? extractFlag(args, '-f') ?? 'md'
    const outputPath = extractFlag(args, '--output') ?? extractFlag(args, '-o')

    const sessionId = ctx.session.getSessionId()
    const dir = join(ctx.cwd, '.orchentra', 'sessions')

    // Find session file
    let files: string[]
    try {
      files = await import('node:fs').then((fs) => fs.readdirSync(dir))
    } catch {
      process.stdout.write('No session data found.\n')
      return true
    }

    const match = files.find((f) => f.startsWith(sessionId.slice(0, 8)) && f.endsWith('.jsonl'))
    if (!match) {
      process.stdout.write('Current session file not found.\n')
      return true
    }

    const raw = await readFile(join(dir, match), 'utf8')
    const lines = raw
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
    const records = lines.map((l) => JSON.parse(l))

    let output: string
    if (format === 'json') {
      output = JSON.stringify(records, null, 2)
    } else {
      output = records
        .filter((r: Record<string, unknown>) => r.event)
        .map((r: Record<string, unknown>) => {
          const event = r.event as Record<string, unknown>
          if (event.kind === 'text') return event.delta
          if (event.kind === 'tool_use') return `\n[tool: ${(event.call as Record<string, unknown>)?.name}]\n`
          if (event.kind === 'tool_result')
            return `[result: ${(event.result as Record<string, unknown>)?.content?.toString().slice(0, 100)}]`
          return null
        })
        .filter(Boolean)
        .join('')
    }

    if (outputPath) {
      writeFileSync(outputPath, output)
      process.stdout.write(`Exported to ${outputPath}\n`)
    } else {
      process.stdout.write(output + '\n')
    }
    return true
  }
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}
