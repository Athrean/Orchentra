import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class SessionCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'session',
    aliases: [],
    summary: 'List, show, or delete sessions',
    argumentHint: '[list | show <id> | delete <id>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const sub = args[0] ?? 'list'

    if (sub === 'delete' || sub === 'rm') {
      const id = args[1]
      if (!id) {
        process.stdout.write('error: session ID required\n')
        return true
      }
      return this.handleDelete(ctx, id)
    }
    if (sub === 'show') {
      const id = args[1]
      if (!id) {
        process.stdout.write('error: session ID required\n')
        return true
      }
      return this.handleShow(ctx, id)
    }
    return this.handleList(ctx)
  }

  private async handleList(ctx: CommandContext): Promise<boolean> {
    const dir = join(ctx.cwd, '.orchentra', 'sessions')
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      process.stdout.write('No sessions found.\n')
      return true
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl')).sort()
    if (jsonlFiles.length === 0) {
      process.stdout.write('No sessions found.\n')
      return true
    }

    const sessionId = ctx.session.getSessionId()
    for (const f of jsonlFiles) {
      const filePath = join(dir, f)
      const s = await stat(filePath)
      const size = (s.size / 1024).toFixed(1)
      const id = f.replace('.jsonl', '')
      const current = id === sessionId.slice(0, id.length) || f.startsWith(sessionId.slice(0, 8)) ? ' (current)' : ''
      process.stdout.write(`  ${f}  ${size}KB  ${s.mtime.toISOString().slice(0, 16)}${current}\n`)
    }
    process.stdout.write(`\n${jsonlFiles.length} session(s)\n`)
    return true
  }

  private async handleShow(ctx: CommandContext, idPrefix: string): Promise<boolean> {
    const dir = join(ctx.cwd, '.orchentra', 'sessions')
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      process.stdout.write('Session not found.\n')
      return true
    }

    const match = files.find((f) => f.startsWith(idPrefix) && f.endsWith('.jsonl'))
    if (!match) {
      process.stdout.write(`Session not found: ${idPrefix}\n`)
      return true
    }

    const filePath = join(dir, match)
    const content = await import('node:fs').then((fs) => fs.readFileSync(filePath, 'utf8'))
    const lines = content
      .trim()
      .split('\n')
      .filter((l: string) => l.length > 0)
    process.stdout.write(`Session: ${match}\nEvents: ${lines.length}\n`)
    return true
  }

  private async handleDelete(ctx: CommandContext, idPrefix: string): Promise<boolean> {
    const dir = join(ctx.cwd, '.orchentra', 'sessions')
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      process.stdout.write('Session not found.\n')
      return true
    }

    const match = files.find((f) => f.startsWith(idPrefix) && f.endsWith('.jsonl'))
    if (!match) {
      process.stdout.write(`Session not found: ${idPrefix}\n`)
      return true
    }

    await unlink(join(dir, match))
    process.stdout.write(`Deleted session: ${match}\n`)
    return true
  }
}
