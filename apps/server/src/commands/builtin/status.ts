import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db, incidents } from '../../db/client'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'

const STATUS_VALUES = ['investigating', 'fixing', 'resolved', 'dismissed', 'snoozed'] as const
type IncidentStatus = (typeof STATUS_VALUES)[number]

const ArgsSchema = z.object({
  limit: z.number().int().min(1).max(20).default(10),
  repo: z.string().min(1).optional(),
  status: z.enum(STATUS_VALUES).optional(),
})

interface StatusRow {
  id: string
  repo: string
  branch: string
  workflowName: string
  status: string
  confidence: number | null
  triggeredAt: Date | null
}

const STATUS_GLYPH: Record<string, string> = {
  investigating: '○',
  fixing: '◐',
  resolved: '●',
  dismissed: '✕',
  snoozed: '⌛',
}

export class StatusCommand implements CommandHandler {
  readonly spec: SlashCommandSpec = {
    name: 'status',
    aliases: [],
    summary: 'Show recent incidents with status and confidence',
    argumentHint: '[--limit N] [--repo owner/name] [--status <state>]',
  }

  async *execute(args: string[], ctx: CommandContext): AsyncIterable<string> {
    let parsed: z.infer<typeof ArgsSchema>
    try {
      parsed = ArgsSchema.parse(parseArgs(args))
    } catch (err) {
      const msg = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : String(err)
      yield `error: ${msg}\n`
      return
    }

    const conditions = [eq(incidents.orgId, ctx.orgId)]
    if (parsed.repo) conditions.push(eq(incidents.repo, parsed.repo.toLowerCase()))
    if (parsed.status) conditions.push(eq(incidents.status, parsed.status))

    const rows = (await db
      .select({
        id: incidents.id,
        repo: incidents.repo,
        branch: incidents.branch,
        workflowName: incidents.workflowName,
        status: incidents.status,
        confidence: incidents.confidence,
        triggeredAt: incidents.triggeredAt,
      })
      .from(incidents)
      .where(and(...conditions))
      .orderBy(desc(incidents.triggeredAt))
      .limit(parsed.limit)) as StatusRow[]

    if (rows.length === 0) {
      yield 'No incidents found.\n'
      return
    }

    yield `Recent incidents (showing ${rows.length}):\n`
    for (const row of rows) {
      yield formatRow(row)
    }
    yield `— ${rows.length} incident${rows.length === 1 ? '' : 's'}\n`
  }
}

function formatRow(row: StatusRow): string {
  const glyph = STATUS_GLYPH[row.status] ?? '?'
  const conf = row.confidence == null ? '—' : `${Math.round(row.confidence * 100)}%`
  const ago = row.triggeredAt ? agoString(row.triggeredAt) : '—'
  return `  ${glyph} ${row.repo} · ${row.workflowName} · ${row.branch} · conf ${conf} · ${ago}\n`
}

function agoString(date: Date): string {
  const ms = Date.now() - date.getTime()
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function parseArgs(args: string[]): { limit?: number; repo?: string; status?: IncidentStatus } {
  const out: { limit?: number; repo?: string; status?: string } = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--limit' && i + 1 < args.length) {
      const n = Number(args[++i])
      if (Number.isFinite(n)) out.limit = n
    } else if (arg === '--repo' && i + 1 < args.length) {
      out.repo = args[++i]
    } else if (arg === '--status' && i + 1 < args.length) {
      out.status = args[++i]
    } else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length))
      if (Number.isFinite(n)) out.limit = n
    } else if (arg.startsWith('--repo=')) {
      out.repo = arg.slice('--repo='.length)
    } else if (arg.startsWith('--status=')) {
      out.status = arg.slice('--status='.length)
    }
  }
  return out as { limit?: number; repo?: string; status?: IncidentStatus }
}
