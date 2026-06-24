import type { PermissionMode } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiKVRow } from '../ui-output'

// Keyed by PermissionMode so the type forces this list to stay complete — it is
// the canonical "valid modes" set for the view and the switch validation.
const MODE_DESC: Record<PermissionMode, string> = {
  'read-only': 'read files, search, run read-only commands; no writes',
  'workspace-write': 'read + write within the workspace; prompts for risky actions',
  'danger-full-access': 'full filesystem + command access, no sandbox',
  prompt: 'ask before every tool call',
  allow: 'allow every tool call without prompting (skip permissions)',
}

const MODES = Object.keys(MODE_DESC) as PermissionMode[]

function isMode(value: string): value is PermissionMode {
  return (MODES as string[]).includes(value)
}

export class PermissionsCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'permissions',
    aliases: ['perm'],
    summary: 'Show or switch the permission mode',
    argumentHint: '[read-only|workspace-write|danger-full-access|prompt|allow]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = args.join(' ').trim()

    if (requested) {
      if (!isMode(requested)) {
        const msg = `invalid permission mode: ${requested}. valid: ${MODES.join(', ')}`
        if (ctx.ui) ctx.ui({ kind: 'note', text: msg })
        else process.stdout.write(msg + '\n')
        return true
      }
      ctx.session.setPermissionMode(requested)
      const msg = `Switched permission mode to: ${requested} — ${MODE_DESC[requested]}`
      if (ctx.ui) ctx.ui({ kind: 'note', text: msg })
      else process.stdout.write(msg + '\n')
      return true
    }

    const active = ctx.session.getPermissionMode()
    const rows: UiKVRow[] = MODES.map((m) => ({
      key: `${m === active ? '● ' : '  '}${m}`,
      value: MODE_DESC[m],
    }))

    if (ctx.ui) {
      ctx.ui({ kind: 'card', title: 'Permission mode', subtitle: active, sections: [{ rows }] })
      return true
    }

    const lines = [`Permission mode: ${active}`, ...rows.map((r) => `  ${r.key.trim().padEnd(20)} ${r.value}`)]
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}
