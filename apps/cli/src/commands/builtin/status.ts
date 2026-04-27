import { formatUsd, pricingForModel } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiCardSection } from '../ui-output'

const TABS = ['Account', 'Config', 'Usage', 'Stats'] as const
type TabName = (typeof TABS)[number]

export class StatusCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'status',
    aliases: [],
    summary: 'Show session info — account, config, usage, stats',
    argumentHint: '[account|config|usage|stats]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const active = pickTab(args[0])
    const sections = sectionsFor(active, ctx)
    const tabs = { items: TABS as readonly string[], active: TABS.indexOf(active) }

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: `Status — ${active}`,
        tabs,
        sections,
      })
      return true
    }

    // Fallback for non-TUI surfaces (one-shot CLI). Print as plaintext.
    const lines: string[] = [`Status — ${active}`]
    for (const s of sections) {
      if (s.title) lines.push('', s.title)
      const w = Math.max(...s.rows.map((r) => r.key.length))
      for (const r of s.rows) lines.push(`  ${r.key.padEnd(w)}  ${r.value}`)
    }
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}

function pickTab(arg?: string): TabName {
  const normalized = arg?.toLowerCase()
  for (const t of TABS) if (t.toLowerCase() === normalized) return t
  return 'Account'
}

function sectionsFor(tab: TabName, ctx: CommandContext): UiCardSection[] {
  switch (tab) {
    case 'Account':
      return [
        {
          rows: [
            { key: 'Session', value: ctx.session.getSessionId() },
            { key: 'CWD', value: ctx.cwd },
          ],
        },
      ]
    case 'Config':
      return [
        {
          rows: [
            { key: 'Model', value: ctx.session.getModel() },
            { key: 'Permission', value: ctx.session.getPermissionMode() },
          ],
        },
      ]
    case 'Usage': {
      const u = ctx.session.getUsage()
      const total = u.inputTokens + u.outputTokens
      return [
        {
          rows: [
            { key: 'Input tokens', value: formatNumber(u.inputTokens) },
            { key: 'Output tokens', value: formatNumber(u.outputTokens) },
            { key: 'Cache create', value: formatNumber(u.cacheCreationTokens) },
            { key: 'Cache read', value: formatNumber(u.cacheReadTokens) },
            { key: 'Total', value: formatNumber(total), bold: true },
          ],
        },
      ]
    }
    case 'Stats': {
      const u = ctx.session.getUsage()
      const pricing = pricingForModel(ctx.session.getModel())
      const cost = pricing
        ? formatUsd(
            (u.inputTokens / 1_000_000) * pricing.inputCostPerMillion +
              (u.outputTokens / 1_000_000) * pricing.outputCostPerMillion,
          )
        : 'unavailable'
      return [
        {
          rows: [
            { key: 'Turns', value: String(ctx.session.getTurns()) },
            { key: 'Estimated cost', value: cost },
          ],
        },
      ]
    }
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
