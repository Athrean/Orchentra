import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class PlanCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'plan',
    aliases: [],
    summary: 'Toggle planning mode without tool execution',
    argumentHint: '[on|off|status]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const action = (args[0] ?? 'on').toLowerCase()

    if (!ctx.session.setPlanMode) {
      emit(ctx, 'Plan mode is unavailable in this session.', 'warn')
      return true
    }

    if (action === 'status') {
      const enabled = ctx.session.getPlanMode?.() ?? false
      emit(ctx, `Plan mode: ${enabled ? 'on' : 'off'}`)
      return true
    }

    if (action === 'off' || action === 'exit' || action === 'false') {
      ctx.session.setPlanMode(false)
      emit(ctx, 'Plan mode disabled. Tools may run again.')
      return true
    }

    if (action !== 'on' && action !== 'true') {
      emit(ctx, `Unknown plan action "${action}". Use on, off, or status.`, 'warn')
      return true
    }

    ctx.session.setPlanMode(true)
    emit(ctx, 'Plan mode enabled. Tools are blocked until /plan off.')
    return true
  }
}

function emit(ctx: CommandContext, text: string, tone?: 'info' | 'warn'): void {
  if (ctx.ui) ctx.ui(tone ? { kind: 'note', tone, text } : { kind: 'note', text })
  else process.stdout.write(text + '\n')
}
