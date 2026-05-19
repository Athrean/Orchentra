import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { getSessionsDirForWorkspace } from '../../session-config'

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
    const dir = getSessionsDirForWorkspace(ctx.cwd)

    // Find session file
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return note(ctx, 'No session data found.', 'warn')
    }

    const match = files.find((f) => f.startsWith(sessionId.slice(0, 8)) && f.endsWith('.jsonl'))
    if (!match) return note(ctx, 'Current session file not found.', 'warn')

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
      if (ctx.ui) {
        ctx.ui({
          kind: 'card',
          title: 'Exported',
          sections: [
            {
              rows: [
                { key: 'Format', value: format },
                { key: 'Path', value: outputPath },
                { key: 'Records', value: String(records.length) },
              ],
            },
          ],
        })
      } else {
        process.stdout.write(`Exported to ${outputPath}\n`)
      }
    } else {
      if (ctx.ui) ctx.ui({ kind: 'text', text: output })
      else process.stdout.write(output + '\n')
    }
    return true
  }
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else process.stdout.write(text + '\n')
  return true
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}
