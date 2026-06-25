import { isTerseMode, type TerseMode } from '@orchentra/cli-core'
import { setActiveTerseMode } from '../../session-config'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class TerseCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'terse',
    aliases: [],
    summary: 'Show or set terse output mode',
    argumentHint: '[off|lite|full|ultra]',
  }

  constructor(private readonly persist: (mode: TerseMode) => void = setActiveTerseMode) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = (args[0] ?? '').toLowerCase()
    if (!requested) {
      emit(ctx, `Terse output mode: ${ctx.session.getTerseMode?.() ?? 'off'}`)
      return true
    }

    if (!isTerseMode(requested)) {
      emit(ctx, `Unknown terse mode "${requested}". Use off, lite, full, or ultra.`, 'warn')
      return true
    }

    const mode = ctx.session.setTerseMode?.(requested) ?? requested
    this.persist(mode)
    emit(ctx, `Terse output mode set to: ${mode}`)
    return true
  }
}

function emit(ctx: CommandContext, text: string, tone?: 'info' | 'warn'): void {
  if (ctx.ui) ctx.ui(tone ? { kind: 'note', tone, text } : { kind: 'note', text })
  else process.stdout.write(text + '\n')
}
