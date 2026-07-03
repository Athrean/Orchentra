import { formatUsd, type SpineBudgetControls, type SpineSavings } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiCardSection } from '../ui-output'

export class BudgetCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'budget',
    aliases: [],
    summary: 'Show or set context, cost, and tool-output budget controls',
    argumentHint: '[status|compact|warn <usd|off>|cap <usd|off>|tool-output <chars|off>|threshold <0.1-0.95>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const action = (args[0] ?? 'status').toLowerCase()
    if (action === 'status') return show(ctx)
    if (action === 'compact') {
      ctx.session.forceCompact()
      return note(ctx, 'Context compaction queued for the next turn.')
    }
    if (action === 'warn' || action === 'cap') return setCost(action, args[1], ctx)
    if (action === 'tool-output') return setToolOutput(args[1], ctx)
    if (action === 'threshold') return setThreshold(args[1], ctx)
    return note(
      ctx,
      `Unknown budget action "${action}". Use status, compact, warn, cap, tool-output, or threshold.`,
      'warn',
    )
  }
}

function show(ctx: CommandContext): boolean {
  const controls = budgetControls(ctx)
  const savings = ctx.session.getSavings?.() ?? zeroSavings()
  const stats = ctx.session.getContextStats?.()
  const sections: UiCardSection[] = [
    {
      title: 'Cost',
      rows: [
        { key: 'Warn at', value: controls.warnCostUsd === undefined ? 'off' : formatUsd(controls.warnCostUsd) },
        { key: 'Hard cap', value: controls.maxCostUsd === undefined ? 'off' : formatUsd(controls.maxCostUsd) },
      ],
    },
    {
      title: 'Context',
      rows: [
        { key: 'Messages', value: stats ? String(stats.messages) : 'unknown' },
        { key: 'Estimated tokens', value: stats ? formatNumber(stats.estimatedTokens) : 'unknown' },
        { key: 'Compact at', value: `${Math.round(controls.compactionThreshold * 100)}%` },
        { key: 'Keep recent', value: String(controls.keepRecentOnCompact) },
      ],
    },
    {
      title: 'Tool output',
      rows: [
        {
          key: 'Provider cap',
          value: controls.toolOutputBudgetChars <= 0 ? 'off' : `${formatNumber(controls.toolOutputBudgetChars)} chars`,
        },
      ],
    },
    {
      title: 'Measured savings',
      rows: [
        {
          key: 'Compaction',
          value: `${savings.compactions} run(s), ${formatNumber(savings.compactionTokensSaved)} tokens saved`,
        },
        {
          key: 'Tool trims',
          value: `${savings.toolOutputTrims} trim(s), ${formatNumber(savings.toolOutputCharsTrimmed)} chars trimmed`,
        },
      ],
    },
  ]

  if (ctx.ui) ctx.ui({ kind: 'card', title: 'Budget', subtitle: 'Context + cost + tool output', sections })
  else process.stdout.write(renderPlain(sections))
  return true
}

function setCost(action: 'warn' | 'cap', raw: string | undefined, ctx: CommandContext): boolean {
  if (!ctx.session.setBudgetControls) return note(ctx, 'Budget controls are unavailable in this session.', 'warn')
  const parsed = parseUsd(raw)
  if (parsed instanceof Error) return note(ctx, parsed.message, 'warn')
  const patch = action === 'warn' ? { warnCostUsd: parsed } : { maxCostUsd: parsed }
  const next = ctx.session.setBudgetControls(patch)
  const label = action === 'warn' ? 'Warn at' : 'Hard cap'
  return note(
    ctx,
    `${label}: ${parsed === undefined ? 'off' : formatUsd(next[action === 'warn' ? 'warnCostUsd' : 'maxCostUsd'] ?? parsed)}`,
  )
}

function setToolOutput(raw: string | undefined, ctx: CommandContext): boolean {
  if (!ctx.session.setBudgetControls) return note(ctx, 'Budget controls are unavailable in this session.', 'warn')
  const parsed = parseChars(raw)
  if (parsed instanceof Error) return note(ctx, parsed.message, 'warn')
  const next = ctx.session.setBudgetControls({ toolOutputBudgetChars: parsed })
  return note(
    ctx,
    `Tool output cap: ${next.toolOutputBudgetChars <= 0 ? 'off' : `${formatNumber(next.toolOutputBudgetChars)} chars`}`,
  )
}

function setThreshold(raw: string | undefined, ctx: CommandContext): boolean {
  if (!ctx.session.setBudgetControls) return note(ctx, 'Budget controls are unavailable in this session.', 'warn')
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 0.95) {
    return note(ctx, 'threshold must be a number from 0.1 to 0.95', 'warn')
  }
  const next = ctx.session.setBudgetControls({ compactionThreshold: parsed })
  return note(ctx, `Compaction threshold: ${Math.round(next.compactionThreshold * 100)}%`)
}

function budgetControls(ctx: CommandContext): SpineBudgetControls {
  return (
    ctx.session.getBudgetControls?.() ?? {
      maxCostUsd: ctx.session.getCostLimits?.().maxCostUsd,
      warnCostUsd: ctx.session.getCostLimits?.().warnCostUsd,
      toolOutputBudgetChars: 50_000,
      compactionThreshold: 0.8,
      keepRecentOnCompact: 6,
    }
  )
}

function zeroSavings(): SpineSavings {
  return {
    compactions: 0,
    compactionTokensSaved: 0,
    toolOutputTrims: 0,
    toolOutputCharsTrimmed: 0,
  }
}

function parseUsd(raw: string | undefined): number | undefined | Error {
  if (!raw) return new Error('expected usd value or off')
  if (raw.toLowerCase() === 'off') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return new Error('usd value must be positive')
  return value
}

function parseChars(raw: string | undefined): number | Error {
  if (!raw) return new Error('expected char count or off')
  if (raw.toLowerCase() === 'off') return 0
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1000) return new Error('tool-output chars must be an integer >= 1000, or off')
  return value
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', text, tone })
  else {
    const stream = tone === 'warn' ? process.stderr : process.stdout
    stream.write(text + '\n')
  }
  return tone !== 'warn'
}

function renderPlain(sections: readonly UiCardSection[]): string {
  const lines = ['Budget']
  for (const section of sections) {
    if (section.title) lines.push('', section.title)
    const width = Math.max(...section.rows.map((row) => row.key.length))
    for (const row of section.rows) lines.push(`  ${row.key.padEnd(width)}  ${row.value}`)
  }
  return lines.join('\n') + '\n'
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}
