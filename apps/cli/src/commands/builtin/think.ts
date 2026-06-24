import type { EffortTier } from '@orchentra/cli-core'
import { isEffortTier } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ThinkCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'think',
    aliases: [],
    summary: 'Set reasoning effort, defaulting to high',
    argumentHint: '[low|medium|high]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = (args[0] ?? 'high').toLowerCase()
    if (!isEffortTier(requested)) {
      emit(ctx, `Unknown effort "${requested}". Use low, medium, or high.`, 'warn')
      return true
    }

    const effort = setEffort(ctx, requested)
    emit(ctx, `Thinking effort set to: ${effort}`)
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
