import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { architect, type ArchitectPlan } from '../../composites/architect'
import { buildOneShotLlmCaller } from '../../composites/llm-caller'
import type { LlmCaller } from '../../composites/scan'

export class PlanCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'plan',
    aliases: [],
    summary: 'Architect a need into a stack, alternatives, and a scaffold (BYOK)',
    argumentHint: '<what to build>',
  }

  // Inject for tests; production builds a one-shot caller from the session model.
  constructor(private readonly llm?: LlmCaller) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const need = args.join(' ').trim()
    if (need.length === 0) {
      emit(ctx, 'usage: /plan <what to build> — e.g. /plan add a rate limiter to the bash tool', 'warn')
      return true
    }

    const llm = this.llm ?? buildOneShotLlmCaller(ctx.session.getModel())
    const result = await architect({ need, llm, terseMode: ctx.session.getTerseMode?.() })
    if ('error' in result) {
      emit(ctx, `error: ${result.error}`, 'warn')
      return false
    }

    const text = render(result)
    if (ctx.ui) ctx.ui({ kind: 'text', text })
    else process.stdout.write(text + '\n')
    return true
  }
}

function render(p: ArchitectPlan): string {
  const lines: string[] = []
  lines.push(`Recommended: ${p.recommendedStack}`)
  lines.push(`  ${p.rationale}`)
  lines.push('')
  lines.push('Alternatives:')
  p.alternatives.forEach((a, i) => lines.push(`  ${i + 1}. ${a.name} — ${a.tradeoff}`))
  lines.push('')
  lines.push('Architecture:')
  lines.push(`  ${p.architecture}`)
  lines.push('')
  lines.push('Proposed scaffold (not written):')
  for (const s of p.scaffold) lines.push(`  ${s.path} — ${s.purpose}`)
  lines.push('')
  lines.push('Verification:')
  for (const v of p.verification) lines.push(`  - ${v}`)
  lines.push('')
  lines.push(`(model: ${p.model} · in ${p.tokensIn} · out ${p.tokensOut})`)
  return lines.join('\n')
}

function emit(ctx: CommandContext, text: string, tone?: 'info' | 'warn'): void {
  if (ctx.ui) ctx.ui(tone ? { kind: 'note', tone, text } : { kind: 'note', text })
  else process.stdout.write(text + '\n')
}
