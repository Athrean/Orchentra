import type { EffortTier } from '@orchentra/cli-core'
import { isEffortTier } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class EffortCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'effort',
    aliases: [],
    summary: 'Show or set reasoning effort',
    argumentHint: '[low|medium|high]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = args.join(' ').trim().toLowerCase()

    if (!requested) {
      const effort = ctx.session.getEffort?.() ?? 'medium'
      emit(ctx, `Current effort: ${effort}`)
      return true
    }

    if (!isEffortTier(requested)) {
      emit(ctx, `Unknown effort "${requested}". Use low, medium, or high.`, 'warn')
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
