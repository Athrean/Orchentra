import type { EffortTier } from '@orchentra/cli-core'
import { isEffortTier } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class EffortCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'effort',
    aliases: [],
    summary: 'Show or set reasoning effort',
    argumentHint: '[low|medium|high|xhigh|max]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = args.join(' ').trim().toLowerCase()

    // No arg + TUI → open the slider. Plain sessions keep the text summary
    // so scripts and pipes never hang on an interactive prompt.
    if (!requested) {
      const effort = ctx.session.getEffort?.() ?? 'medium'
      if (ctx.ui) {
        ctx.ui({ kind: 'effort-picker', current: effort })
        return true
      }
      emit(ctx, `Current effort: ${effort}`)
      return true
    }

    if (!isEffortTier(requested)) {
      emit(ctx, `Unknown effort "${requested}". Use low, medium, high, xhigh, or max.`, 'warn')
      return true
    }

    const effort = setEffort(ctx, requested)
    emit(ctx, `Effort set to: ${effort}`)
    return true
  }
}

function setEffort(ctx: CommandContext, effort: EffortTier): EffortTier {
  return ctx.session.setEffort?.(effort) ?? effort
}

function emit(ctx: CommandContext, text: string, tone?: 'info' | 'warn'): void {
  if (ctx.ui) ctx.ui(tone ? { kind: 'note', tone, text } : { kind: 'note', text })
  else process.stdout.write(text + '\n')
}
