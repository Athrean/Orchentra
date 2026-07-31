import { readdir, stat, unlink, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionRetrieval, SessionRetrievalError, type ChatMessage } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { THEME } from '../../tui/theme'
import type { UiKVRow } from '../ui-output'
import { getSessionsDirForWorkspace } from '../../session-config'
import { ResumeCommand } from './resume'

export class SessionCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'session',
    aliases: [],
    summary: 'List, show, resume, or delete sessions; retrieve original trimmed/compacted content',
    argumentHint: '[list | show <id> | resume <id> | delete <id> | retrieve <tool_call_id> | retrieve compaction <n>]',
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
    if (sub === 'retrieve') {
      return this.handleRetrieve(ctx, args.slice(1))
    }
    return this.handleList(ctx)
  }

  /**
   * Pure terminal display of original content recovered from the current
   * session's log — never enters the provider-bound context, so it costs
   * zero tokens. Scoped to the active session by construction.
   */
  private async handleRetrieve(ctx: CommandContext, args: string[]): Promise<boolean> {
    const usage = 'usage: /session retrieve <tool_call_id> | retrieve compaction <ordinal>'
    if (!args[0]) return note(ctx, usage, 'warn')

    const dir = getSessionsDirForWorkspace(ctx.cwd)
    const retrieval = new SessionRetrieval(join(dir, `${ctx.session.getSessionId()}.jsonl`))
    try {
      if (args[0] === 'compaction') {
        const ordinal = Number(args[1])
        if (!Number.isInteger(ordinal) || ordinal < 1) return note(ctx, usage, 'warn')
        const messages = await retrieval.reconstructBeforeCompaction(ordinal)
        return display(
          ctx,
          `Original messages before compaction ${ordinal} (${messages.length} messages):\n\n${formatMessages(messages)}`,
        )
      }
      const r = await retrieval.retrieveToolOutput(args[0])
      return display(
        ctx,
        `Original output of ${r.toolCallId} — ${r.droppedChars} of ${r.originalChars} chars had been trimmed:\n\n${r.content}`,
      )
    } catch (err) {
      if (err instanceof SessionRetrievalError) return note(ctx, err.message, 'warn')
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return note(ctx, 'No session log for the current session yet.', 'warn')
      }
      throw err
    }
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
    const topFiles = jsonlFiles.slice(0, 20)
    const stats = await Promise.all(topFiles.map((f) => stat(join(dir, f))))
    const rows: UiKVRow[] = topFiles.map((f, i) => {
      const s = stats[i]!
      const size = (s.size / 1024).toFixed(1)
      const id = f.replace('.jsonl', '')
      const isCurrent = id === sessionId.slice(0, id.length) || f.startsWith(sessionId.slice(0, 8))
      return {
        key: id.slice(0, 12),
        value: `${size.padStart(6)}KB  ${s.mtime.toISOString().slice(0, 16)}${isCurrent ? '  · current' : ''}`,
        valueColor: isCurrent ? THEME.brand : undefined,
        bold: isCurrent,
      }
    })

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

function display(ctx: CommandContext, text: string): boolean {
  if (ctx.ui) ctx.ui({ kind: 'text', text })
  else process.stdout.write(text + '\n')
  return true
}

function formatMessages(messages: readonly ChatMessage[]): string {
  return messages
    .map((m, i) => {
      const id = m.toolCallId ? ` ${m.toolCallId}` : ''
      const toolCalls =
        m.toolCalls && m.toolCalls.length > 0
          ? `\n  tool_calls: ${m.toolCalls.map((c) => `${c.name}(${c.id})`).join(', ')}`
          : ''
      return `${i + 1}. ${m.role}${id}:\n${indent(m.content)}${toolCalls}`
    })
    .join('\n\n')
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}
