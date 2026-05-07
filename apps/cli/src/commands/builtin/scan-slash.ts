import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { scan, type LlmCaller } from '../../composites/scan'

/**
 * Slice K /scan slash command. Hooks the diff/full/path collector into a
 * BYOK LLM caller. Until provider wiring lands in a follow-up, the default
 * caller short-circuits with a friendly message pointing to /login.
 */
export class ScanSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'scan',
    aliases: [],
    summary: 'LLM code review of a diff, the working tree, or a single file (BYOK)',
    argumentHint: '[--diff|--full|--path <p>]',
  }

  private readonly llm: LlmCaller

  constructor(opts?: { llm?: LlmCaller }) {
    this.llm = opts?.llm ?? defaultLlm
  }

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
    const result = await scan({ cwd: ctx.cwd, mode, path, llm: this.llm })
    if ('error' in result) {
      const text = `error: ${result.error}`
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text })
      else process.stderr.write(text + '\n')
      return false
    }
    const lines: string[] = []
    if (result.findings.length === 0) {
      lines.push('no findings')
    } else {
      for (const f of result.findings) {
        lines.push(`[${f.severity}] ${f.file}${f.line !== null ? `:${f.line}` : ''} — ${f.title}`)
        lines.push(`  ${f.description}`)
        if (f.suggestedFix) lines.push(`  fix: ${f.suggestedFix}`)
      }
    }
    lines.push('')
    lines.push(`(model: ${result.model} · in ${result.tokensIn} · out ${result.tokensOut})`)
    const text = lines.join('\n')
    if (ctx.ui) ctx.ui({ kind: 'text', text })
    else process.stdout.write(text + '\n')
    return true
  }
}

const defaultLlm: LlmCaller = async () => {
  throw new Error('no LLM provider configured. Run `/login` (or `orchentra login <provider> --api-key ...`) first.')
}
