import { readFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
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
      process.stdout.write('No sessions found.\n')
      return true
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))
    if (jsonlFiles.length === 0) {
      process.stdout.write('No sessions found.\n')
      return true
    }

    let targetFile: string | undefined
    if (idArg === 'latest') {
      // Find most recently modified
      let latestTime = 0
      for (const f of jsonlFiles) {
        const s = await import('node:fs').then((fs) => fs.statSync(join(dir, f)))
        if (s.mtimeMs > latestTime) {
          latestTime = s.mtimeMs
          targetFile = f
        }
      }
    } else {
      targetFile = jsonlFiles.find((f) => f.startsWith(idArg))
    }

    if (!targetFile) {
      process.stdout.write(`Session not found: ${idArg}\n`)
      return true
    }

    const raw = await readFile(join(dir, targetFile), 'utf8')
    const lines = raw
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)

    // Extract text events as summary
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

    process.stdout.write(`Session: ${targetFile}\n`)
    process.stdout.write(`Events: ${lines.length}, Tool calls: ${toolCallCount}\n`)
    process.stdout.write(`---\n`)
    const fullText = textParts.join('')
    process.stdout.write(fullText.slice(0, 2000) + (fullText.length > 2000 ? '\n...(truncated)' : '') + '\n')
    return true
  }
}
