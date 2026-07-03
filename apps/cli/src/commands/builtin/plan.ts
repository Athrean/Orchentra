import { spinePrompt } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { architect, type ArchitectPlan } from '../../composites/architect'
import { writeScaffold, type ScaffoldReport } from '../../composites/scaffold'
import { buildOneShotLlmCaller } from '../../composites/llm-caller'
import type { LlmCaller } from '../../composites/scan'

export class PlanCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'plan',
    aliases: [],
    summary: 'Architect a need into a stack, alternatives, and a scaffold (BYOK)',
    argumentHint: '[--scaffold] <what to build>',
  }

  // Inject for tests; production builds a one-shot caller from the session model.
  constructor(private readonly llm?: LlmCaller) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const scaffold = args.includes('--scaffold')
    const need = args
      .filter((a) => a !== '--scaffold')
      .join(' ')
      .trim()
    const transcriptNeed = need.length === 0 ? (ctx.getRecentTranscriptContext?.() ?? '').trim() : ''
    const effectiveNeed = need || transcriptNeed
    if (effectiveNeed.length === 0) {
      // No need + TUI → open the depth slider (Core/Plus/Max). Plain sessions
      // get the usage hint so scripts never hang on an interactive prompt.
      if (ctx.ui) {
        ctx.ui({ kind: 'plan-level-picker', current: ctx.session.getPlanLevel?.() ?? 'plus' })
        return true
      }
      emit(ctx, 'usage: /plan <what to build> — e.g. /plan add a rate limiter to the bash tool', 'warn')
      return true
    }

    const llm = this.llm ?? buildOneShotLlmCaller(ctx.session.getModel())
    const result = await architect({
      need: effectiveNeed,
      llm,
      terseMode: ctx.session.getTerseMode?.(),
      planLevel: ctx.session.getPlanLevel?.(),
      spinePrompt: spinePrompt({
        terseMode: ctx.session.getTerseMode?.(),
        budget: ctx.session.getBudgetControls?.(),
        taskFocus: '/plan architect',
      }),
    })
    if ('error' in result) {
      emit(ctx, `error: ${result.error}`, 'warn')
      return false
    }

    const report = scaffold ? writeScaffold(result.scaffold, ctx.cwd) : null
    const text = render(result, report)
    if (ctx.ui) ctx.ui({ kind: 'text', text })
    else process.stdout.write(text + '\n')
    return true
  }
}

function render(p: ArchitectPlan, report: ScaffoldReport | null): string {
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
  if (report) {
    lines.push('Wrote scaffold:')
    for (const path of report.created) lines.push(`  + ${path}`)
    for (const path of report.skipped) lines.push(`  · ${path} (exists, skipped)`)
  } else {
    lines.push('Proposed scaffold (not written):')
    for (const s of p.scaffold) lines.push(`  ${s.path} — ${s.purpose}`)
  }
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
