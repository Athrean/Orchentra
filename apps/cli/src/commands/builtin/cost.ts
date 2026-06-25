import { formatUsd, pricingForModel } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class CostCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'cost',
    aliases: [],
    summary: 'Show token usage and estimated cost',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const usage = ctx.session.getUsage()
    const model = ctx.session.getModel()
    const pricing = pricingForModel(model)
    const inputCost = (usage.inputTokens / 1_000_000) * (pricing?.inputCostPerMillion ?? 0)
    const outputCost = (usage.outputTokens / 1_000_000) * (pricing?.outputCostPerMillion ?? 0)
    const total = inputCost + outputCost

    const tokenRows = [
      { key: 'Input', value: usage.inputTokens.toLocaleString() },
      { key: 'Output', value: usage.outputTokens.toLocaleString() },
      { key: 'Cache read', value: (usage.cacheReadTokens ?? 0).toLocaleString() },
      { key: 'Cache create', value: (usage.cacheCreationTokens ?? 0).toLocaleString() },
    ]
    const costRows = [
      { key: 'Input cost', value: formatUsd(inputCost) },
      { key: 'Output cost', value: formatUsd(outputCost) },
      { key: 'Estimated total', value: formatUsd(total), bold: true },
    ]

    const limits = ctx.session.getCostLimits?.() ?? {}
    const budgetRows = [
      ...(limits.warnCostUsd !== undefined ? [{ key: 'Warn at', value: formatUsd(limits.warnCostUsd) }] : []),
      ...(limits.maxCostUsd !== undefined ? [{ key: 'Hard cap', value: formatUsd(limits.maxCostUsd) }] : []),
    ]

    const sections = [
      { title: 'Tokens', rows: tokenRows },
      { title: 'Estimated cost', rows: costRows },
      ...(budgetRows.length > 0 ? [{ title: 'Budget', rows: budgetRows }] : []),
    ]

    if (ctx.ui) {
      ctx.ui({ kind: 'card', title: 'Cost', subtitle: model, sections })
      return true
    }

    const all = [...tokenRows, ...costRows, ...budgetRows]
    const w = Math.max(...all.map((r) => r.key.length))
    const lines = [`Cost — ${model}`, ...all.map((r) => `  ${r.key.padEnd(w)}  ${r.value}`)]
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}
