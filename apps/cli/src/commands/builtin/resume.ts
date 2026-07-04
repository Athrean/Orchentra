import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { getSessionsDirForWorkspace, getSessionsRootDir } from '../../session-config'

const CROSS_PREFIX = 'cross:'

export class ResumeCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'resume',
    aliases: [],
    summary: 'Show a previous session summary',
    argumentHint: '[<id>|latest|cross:<id>|cross:latest]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const rawArg = args[0] ?? 'latest'
    const crossWorkspace = rawArg.startsWith(CROSS_PREFIX)
    const idArg = crossWorkspace ? rawArg.slice(CROSS_PREFIX.length) || 'latest' : rawArg

    const buckets: string[] = crossWorkspace ? await listBucketDirs() : [getSessionsDirForWorkspace(ctx.cwd)]

    const candidates: Array<{ dir: string; file: string; mtimeMs: number }> = []
    for (const dir of buckets) {
      let files: string[]
      try {
        files = await readdir(dir)
      } catch {
        continue
      }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue
        if (idArg !== 'latest' && !f.startsWith(idArg)) continue
        try {
          const s = await stat(join(dir, f))
          if (!s.isFile()) continue
          candidates.push({ dir, file: f, mtimeMs: s.mtimeMs })
        } catch {
          /* skip */
        }
      }
    }

    if (candidates.length === 0) {
      const where = crossWorkspace ? 'across workspaces' : 'in this workspace'
      return note(ctx, `No sessions found ${where}.`, 'warn')
    }

    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const target = candidates[0]!
    const sessionPath = join(target.dir, target.file)

    if (ctx.session.resumeSession) {
      const result = await ctx.session.resumeSession(sessionPath)
      if (ctx.setCwd && result.cwd !== ctx.cwd) ctx.setCwd(result.cwd)
      if (ctx.ui) {
        ctx.ui({
          kind: 'card',
          title: 'Resumed Session',
          subtitle: target.file,
          sections: [
            {
              rows: [
                { key: 'Session', value: result.sessionId },
                { key: 'Messages', value: String(result.messages) },
                { key: 'Events', value: String(result.events) },
                { key: 'Tool calls', value: String(result.toolCalls) },
                { key: 'Cwd', value: result.cwd },
                { key: 'Context', value: result.contextComplete ? 'complete' : 'partial' },
              ],
            },
          ],
        })
        if (!result.contextComplete) {
          ctx.ui({
            kind: 'note',
            tone: 'warn',
            text: 'Historical session lacks persisted user prompts; resumed context is partial.',
          })
        }
      } else {
        process.stdout.write(`Resumed session: ${target.file}\n`)
        process.stdout.write(
          `Messages: ${result.messages}, Events: ${result.events}, Tool calls: ${result.toolCalls}\n`,
        )
        if (!result.contextComplete) {
          process.stdout.write('Historical session lacks persisted user prompts; resumed context is partial.\n')
        }
      }
      return true
    }

    const raw = await readFile(sessionPath, 'utf8')
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
        subtitle: target.file,
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
      process.stdout.write(`Session: ${target.file}\n`)
      process.stdout.write(`Events: ${lines.length}, Tool calls: ${toolCallCount}\n---\n${preview}\n`)
    }
    return true
  }
}

async function listBucketDirs(): Promise<string[]> {
  const root = getSessionsRootDir()
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  const out: string[] = []
  for (const name of entries) {
    try {
      const s = await stat(join(root, name))
      if (s.isDirectory()) out.push(join(root, name))
    } catch {
      /* skip */
    }
  }
  return out
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else process.stdout.write(text + '\n')
  return true
}
