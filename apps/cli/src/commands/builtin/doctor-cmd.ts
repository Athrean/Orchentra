import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { runDoctor, type DoctorCheck } from '../doctor'
import { THEME } from '../../tui/theme'
import type { UiKVRow } from '../ui-output'

export class DoctorCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'doctor',
    aliases: ['doc'],
    summary: 'Run health checks on your setup',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    if (!ctx.ui) {
      process.stdout.write('Running diagnostics...\n\n')
      await runDoctor()
      return true
    }

    const collected: DoctorCheck[] = []
    await runDoctor({ reporter: (c) => collected.push(c) })

    const rows: UiKVRow[] = collected.map((c) => ({
      key: `${glyph(c.status)}  ${c.name}`,
      value: `${c.message ?? ''}  ${dim(c.durationMs)}`,
      valueColor: colorFor(c.status),
    }))
    const failures = collected.filter((c) => c.status === 'fail').length

    ctx.ui({
      kind: 'card',
      title: 'Doctor',
      subtitle: failures > 0 ? `${failures} failing` : 'all checks passed',
      sections: [{ rows }],
    })
    return true
  }
}

function glyph(status: DoctorCheck['status']): string {
  if (status === 'pass') return THEME.check
  if (status === 'fail') return THEME.cross
  return '!'
}

function colorFor(status: DoctorCheck['status']): string | undefined {
  if (status === 'pass') return THEME.brand
  if (status === 'fail') return THEME.danger
  return THEME.warn
}

function dim(ms: number): string {
  return `(${ms}ms)`
}
