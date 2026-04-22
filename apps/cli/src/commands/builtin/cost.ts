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

    const lines = [
      `Model: ${model}`,
      `Input tokens:  ${usage.inputTokens.toLocaleString()}`,
      `Output tokens: ${usage.outputTokens.toLocaleString()}`,
      `Cache read:    ${usage.cacheReadTokens?.toLocaleString() ?? '0'}`,
      `Cache create:  ${usage.cacheCreationTokens?.toLocaleString() ?? '0'}`,
      `Estimated cost: ${formatUsd(total)}`,
    ]
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}
