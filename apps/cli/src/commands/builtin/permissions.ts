import type { PermissionMode, PolicyRule, StoredPermissionRule } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiCardSection, UiKVRow } from '../ui-output'

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
    const sections: UiCardSection[] = [{ title: 'Modes', rows }, ...ruleSections(ctx)]

    if (ctx.ui) {
      ctx.ui({ kind: 'card', title: 'Permission mode', subtitle: active, sections })
      return true
    }

    const lines = [`Permission mode: ${active}`]
    for (const section of sections) {
      if (section.title) lines.push('', section.title)
      const width = Math.max(...section.rows.map((r) => r.key.trim().length))
      for (const r of section.rows) lines.push(`  ${r.key.trim().padEnd(width)}  ${r.value}`)
    }
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}

function ruleSections(ctx: CommandContext): UiCardSection[] {
  const hasConfigRules = typeof ctx.session.listPermissionRules === 'function'
  const hasStoredRules = typeof ctx.session.listStoredPermissionRules === 'function'
  if (!hasConfigRules && !hasStoredRules) return []

  const configured = hasConfigRules ? sortRules(ctx.session.listPermissionRules?.() ?? []) : []
  const configuredKeys = new Set(configured.map(ruleKey))
  const remembered = hasStoredRules
    ? sortStoredRules(ctx.session.listStoredPermissionRules?.() ?? []).filter(
        (rule) => !configuredKeys.has(ruleKey(rule)),
      )
    : []
  const rows: UiKVRow[] = [
    ...configured.map((rule) => ({
      key: rule.decision,
      value: formatRule(rule),
    })),
    ...remembered.map((rule) => ({
      key: `remembered ${rule.decision}`,
      value: formatStoredRule(rule),
    })),
  ]

  return [
    {
      title: 'Resolved rules',
      rows: rows.length > 0 ? rows : [{ key: 'rules', value: 'none' }],
    },
  ]
}

function sortRules(rules: readonly PolicyRule[]): PolicyRule[] {
  const order: Record<PolicyRule['decision'], number> = { allow: 0, deny: 1, ask: 2 }
  return rules.slice().sort((a, b) => order[a.decision] - order[b.decision])
}

function sortStoredRules(rules: readonly StoredPermissionRule[]): StoredPermissionRule[] {
  const order: Record<StoredPermissionRule['decision'], number> = { allow: 0, deny: 1 }
  return rules.slice().sort((a, b) => order[a.decision] - order[b.decision])
}

function formatRule(rule: PolicyRule): string {
  return `${rule.tool} ${rule.pattern}`
}

function formatStoredRule(rule: StoredPermissionRule): string {
  const suffix = rule.addedAt ? ` · ${rule.addedAt}` : ''
  return `${rule.tool} ${rule.pattern}${suffix}`
}

function ruleKey(rule: PolicyRule | StoredPermissionRule): string {
  return `${rule.decision}\0${rule.tool}\0${rule.pattern}`
}
