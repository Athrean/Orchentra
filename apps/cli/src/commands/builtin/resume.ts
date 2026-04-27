import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ResumeCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'resume',
    aliases: [],
    summary: 'Show a previous session summary',
    argumentHint: '[<id>|latest]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const idArg = args[0] ?? 'latest'
    const dir = join(ctx.cwd, '.orchentra', 'sessions')

    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return note(ctx, 'No sessions found.', 'warn')
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))
    if (jsonlFiles.length === 0) return note(ctx, 'No sessions found.', 'warn')

    let targetFile: string | undefined
    if (idArg === 'latest') {
      let latestTime = 0
      for (const f of jsonlFiles) {
        const s = await stat(join(dir, f))
        if (s.mtimeMs > latestTime) {
          latestTime = s.mtimeMs
          targetFile = f
        }
      }
    } else {
      targetFile = jsonlFiles.find((f) => f.startsWith(idArg))
    }

    if (!targetFile) return note(ctx, `Session not found: ${idArg}`, 'warn')

    const raw = await readFile(join(dir, targetFile), 'utf8')
    const lines = raw
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)

    const textParts: string[] = []
    let toolCallCount = 0
    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        const event = record.event
        if (event?.kind === 'text') textParts.push(event.delta)
        if (event?.kind === 'tool_use') toolCallCount++
      } catch {
        // skip malformed lines
      }
    }

    const fullText = textParts.join('')
    const preview = fullText.slice(0, 2000) + (fullText.length > 2000 ? '\n…(truncated)' : '')

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: 'Resume',
        subtitle: targetFile,
        sections: [
          {
            rows: [
              { key: 'Events', value: String(lines.length) },
              { key: 'Tool calls', value: String(toolCallCount) },
            ],
          },
        ],
      })
      if (preview.trim().length > 0) ctx.ui({ kind: 'text', text: preview })
    } else {
      process.stdout.write(`Session: ${targetFile}\n`)
      process.stdout.write(`Events: ${lines.length}, Tool calls: ${toolCallCount}\n---\n${preview}\n`)
    }
    return true
  }
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else process.stdout.write(text + '\n')
  return true
}
