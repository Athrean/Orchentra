import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { review, type CheckRunner, type ReviewResult } from '../../composites/review'
import { buildOneShotLlmCaller } from '../../composites/llm-caller'
import type { LlmCaller } from '../../composites/scan'

/**
 * Phase J /review — propose findings, then verify by running the project's
 * own checks. Findings are the untrusted producer; the executed checks are
 * the trusted checker. /scan stays LLM-only; /review adds the running.
 */
export class ReviewCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'review',
    aliases: [],
    summary: 'Review changes, then verify by running the project checks (BYOK)',
    argumentHint: '[--diff|--full|--path <p>]',
  }

  // Inject for tests; production builds a one-shot caller from the session model.
  constructor(private readonly deps?: { llm?: LlmCaller; run?: CheckRunner }) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    let mode: 'diff' | 'full' | 'path' = 'diff'
    let path: string | undefined
    for (let i = 0; i < args.length; i++) {
      const tok = args[i]
      if (tok === '--diff') mode = 'diff'
      else if (tok === '--full') mode = 'full'
      else if (tok === '--path') {
        mode = 'path'
        path = args[++i]
      }
    }

    const llm = this.deps?.llm ?? buildOneShotLlmCaller(ctx.session.getModel())
    const result = await review({ cwd: ctx.cwd, mode, path, llm, run: this.deps?.run })
    if ('error' in result) {
      const text = `error: ${result.error}`
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text })
      else process.stderr.write(text + '\n')
      return false
    }

    const text = render(result)
    if (ctx.ui) ctx.ui({ kind: 'text', text })
    else process.stdout.write(text + '\n')
    return true
  }
}

function render(r: ReviewResult): string {
  const lines: string[] = []

  if (r.findings.length === 0) {
    lines.push('Findings: none proposed.')
  } else {
    lines.push('Findings (proposed — verify against the checks below):')
    for (const f of r.findings) {
      lines.push(`  [${f.severity}] ${f.file}${f.line !== null ? `:${f.line}` : ''} — ${f.title}`)
      lines.push(`    ${f.description}`)
      if (f.suggestedFix) lines.push(`    fix: ${f.suggestedFix}`)
    }
  }
  lines.push('')

  if (r.checks.length === 0) {
    lines.push('Verified by running: no project checks found — findings are advisory only.')
  } else {
    lines.push('Verified by running:')
    for (const c of r.checks) {
      lines.push(`  [${c.passed ? 'ok' : 'FAIL'}] ${c.name} — ${c.command} (exit ${c.exitCode})`)
      if (!c.passed && c.output.trim().length > 0) {
        for (const ln of c.output.trimEnd().split('\n')) lines.push(`    ${ln}`)
      }
    }
    lines.push('')
    const failed = r.checks.filter((c) => !c.passed)
    lines.push(
      failed.length > 0
        ? `Verdict: ${failed.length} check(s) failing — findings corroborated by a real failing gate.`
        : 'Verdict: all checks pass — proposed findings are advisory (no gate reproduces them).',
    )
  }

  lines.push('')
  lines.push(`(model: ${r.model} · in ${r.tokensIn} · out ${r.tokensOut})`)
  return lines.join('\n')
}
