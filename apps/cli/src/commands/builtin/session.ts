import { readdir, stat, unlink, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { THEME } from '../../tui/theme'
import type { UiKVRow } from '../ui-output'
import { getSessionsDirForWorkspace } from '../../session-config'
import { ResumeCommand } from './resume'

export class SessionCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'session',
    aliases: [],
    summary: 'List, show, resume, or delete sessions',
    argumentHint: '[list | show <id> | resume <id> | delete <id>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const sub = args[0] ?? 'list'

    if (sub === 'delete' || sub === 'rm') {
      const id = args[1]
      if (!id) return note(ctx, 'session ID required', 'warn')
      return this.handleDelete(ctx, id)
    }
    if (sub === 'show') {
      const id = args[1]
      if (!id) return note(ctx, 'session ID required', 'warn')
      return this.handleShow(ctx, id)
    }
    if (sub === 'resume') {
      return new ResumeCommand().execute(args.slice(1), ctx)
    }
    return this.handleList(ctx)
  }

  private async handleList(ctx: CommandContext): Promise<boolean> {
    const dir = getSessionsDirForWorkspace(ctx.cwd)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return note(ctx, 'No sessions found.')
    }

    const jsonlFiles = files
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .reverse()
    if (jsonlFiles.length === 0) return note(ctx, 'No sessions found.')

    const sessionId = ctx.session.getSessionId()
    const rows: UiKVRow[] = []
    for (const f of jsonlFiles.slice(0, 20)) {
      const filePath = join(dir, f)
      const s = await stat(filePath)
      const size = (s.size / 1024).toFixed(1)
      const id = f.replace('.jsonl', '')
      const isCurrent = id === sessionId.slice(0, id.length) || f.startsWith(sessionId.slice(0, 8))
      rows.push({
        key: id.slice(0, 12),
        value: `${size.padStart(6)}KB  ${s.mtime.toISOString().slice(0, 16)}${isCurrent ? '  · current' : ''}`,
        valueColor: isCurrent ? THEME.brand : undefined,
        bold: isCurrent,
      })
    }

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: 'Sessions',
        subtitle: `${jsonlFiles.length} total · showing ${rows.length} · /session resume <id>`,
        sections: [{ rows }],
      })
      return true
    }
    const w = Math.max(...rows.map((r) => r.key.length))
    const lines = ['Sessions', ...rows.map((r) => `  ${r.key.padEnd(w)}  ${r.value}`)]
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }

  private async handleShow(ctx: CommandContext, idPrefix: string): Promise<boolean> {
    const dir = getSessionsDirForWorkspace(ctx.cwd)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return note(ctx, 'Session not found.', 'warn')
    }

    const match = files.find((f) => f.startsWith(idPrefix) && f.endsWith('.jsonl'))
    if (!match) return note(ctx, `Session not found: ${idPrefix}`, 'warn')

    const filePath = join(dir, match)
    const content = await readFile(filePath, 'utf8')
    const events = content
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
    const s = await stat(filePath)

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: 'Session',
        subtitle: match,
        sections: [
          {
            rows: [
              { key: 'Events', value: String(events.length) },
              { key: 'Size', value: `${(s.size / 1024).toFixed(1)} KB` },
              { key: 'Modified', value: s.mtime.toISOString().slice(0, 19).replace('T', ' ') },
            ],
          },
        ],
      })
      return true
    }
    process.stdout.write(`Session: ${match}\nEvents: ${events.length}\n`)
    return true
  }

  private async handleDelete(ctx: CommandContext, idPrefix: string): Promise<boolean> {
    const dir = getSessionsDirForWorkspace(ctx.cwd)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return note(ctx, 'Session not found.', 'warn')
    }

    const match = files.find((f) => f.startsWith(idPrefix) && f.endsWith('.jsonl'))
    if (!match) return note(ctx, `Session not found: ${idPrefix}`, 'warn')

    await unlink(join(dir, match))
    return note(ctx, `Deleted session: ${match}`)
  }
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else process.stdout.write(text + '\n')
  return true
}
