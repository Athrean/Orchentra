import { PatternStore } from '@orchentra/cli-core'
import type { MemoryStore, PatternEntry } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiKVRow } from '../ui-output'

const ORG_ID = 'default'

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else process.stdout.write(text + '\n')
  return true
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

function snippet(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

type Resolved = { kind: 'found'; entry: PatternEntry } | { kind: 'none' } | { kind: 'ambiguous'; count: number }

function resolveByPrefix(entries: PatternEntry[], idArg: string): Resolved {
  const exact = entries.find((e) => e.id === idArg)
  if (exact) return { kind: 'found', entry: exact }
  const matches = entries.filter((e) => e.id.startsWith(idArg))
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length > 1) return { kind: 'ambiguous', count: matches.length }
  return { kind: 'found', entry: matches[0] }
}

export class MemoryCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'memory',
    aliases: ['mem'],
    summary: 'List or inspect stored failure memories',
    argumentHint: '[list | show <id>]',
  }

  constructor(
    private readonly store: MemoryStore = new PatternStore(),
    private readonly orgId: string = ORG_ID,
  ) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const sub = (args[0] ?? '').toLowerCase()
    if (sub === 'show') return this.show(args[1], ctx)
    return this.list(ctx)
  }

  private list(ctx: CommandContext): boolean {
    const entries = this.store
      .load(this.orgId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (entries.length === 0) return note(ctx, 'No memories stored yet.')

    const rows: UiKVRow[] = entries.map((e) => ({
      key: `${shortId(e.id)} · ${e.failureType}`,
      value: `${e.createdAt.slice(0, 10)} — ${snippet(e.pattern)}`,
    }))
    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: 'Memories',
        subtitle: `${entries.length} stored`,
        sections: [{ rows }],
      })
      return true
    }
    const width = Math.max(...rows.map((r) => r.key.length))
    process.stdout.write(rows.map((r) => `  ${r.key.padEnd(width)}  ${r.value}`).join('\n') + '\n')
    return true
  }

  private show(idArg: string | undefined, ctx: CommandContext): boolean {
    if (!idArg) return note(ctx, 'usage: /memory show <id>', 'warn')
    const res = resolveByPrefix(this.store.load(this.orgId), idArg)
    if (res.kind === 'none') return note(ctx, `No memory with id ${idArg}.`, 'warn')
    if (res.kind === 'ambiguous')
      return note(ctx, `Ambiguous id ${idArg} — matches ${res.count} memories; use more characters.`, 'warn')

    const e = res.entry
    const rows: UiKVRow[] = [
      { key: 'id', value: e.id },
      { key: 'failure type', value: e.failureType },
      { key: 'created', value: e.createdAt },
      { key: 'used', value: String(e.usageCount) },
      { key: 'last matched', value: e.lastMatchedAt ?? 'never' },
      { key: 'incident', value: e.incidentId ?? '—' },
    ]
    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: `Memory ${shortId(e.id)}`,
        sections: [
          { title: 'Details', rows },
          { title: 'Pattern', rows: [{ key: '', value: e.pattern }] },
          { title: 'Resolution', rows: [{ key: '', value: e.resolution }] },
        ],
      })
      return true
    }
    process.stdout.write(
      `Memory ${e.id}\n  pattern: ${e.pattern}\n  resolution: ${e.resolution}\n  failure type: ${e.failureType}\n`,
    )
    return true
  }
}

export class ForgetCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'forget',
    aliases: [],
    summary: 'Delete a stored failure memory by id',
    argumentHint: '<id>',
  }

  constructor(
    private readonly store: MemoryStore = new PatternStore(),
    private readonly orgId: string = ORG_ID,
  ) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const idArg = args[0]
    if (!idArg) return note(ctx, 'usage: /forget <id>', 'warn')
    const res = resolveByPrefix(this.store.load(this.orgId), idArg)
    if (res.kind === 'none') return note(ctx, `No memory with id ${idArg}.`, 'warn')
    if (res.kind === 'ambiguous')
      return note(ctx, `Ambiguous id ${idArg} — matches ${res.count} memories; use more characters.`, 'warn')

    this.store.delete(this.orgId, res.entry.id)
    return note(ctx, `Forgot memory ${shortId(res.entry.id)} (${res.entry.failureType}).`)
  }
}
