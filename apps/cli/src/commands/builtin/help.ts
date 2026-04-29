import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { CommandRegistry } from '../registry'
import type { UiCardSection, UiKVRow } from '../ui-output'

const TABS = ['All', 'Core', 'Workspace', 'Server', 'Auth', 'Tools'] as const
type TabName = (typeof TABS)[number]

const CATEGORY: Record<string, TabName> = {
  help: 'Core',
  status: 'Core',
  clear: 'Core',
  exit: 'Core',
  compact: 'Core',
  model: 'Core',
  version: 'Core',
  cost: 'Core',
  diff: 'Workspace',
  commit: 'Workspace',
  pr: 'Workspace',
  issue: 'Workspace',
  session: 'Workspace',
  resume: 'Workspace',
  incidents: 'Server',
  triage: 'Server',
  retry: 'Server',
  explain: 'Server',
  graph: 'Server',
  login: 'Auth',
  logout: 'Auth',
  'auth-status': 'Auth',
  mcp: 'Tools',
  doctor: 'Tools',
  config: 'Tools',
  export: 'Tools',
}

export class HelpCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'help',
    aliases: ['?'],
    summary: 'List slash commands grouped by category',
    argumentHint: '[all|core|workspace|server|auth|tools]',
  }

  private registry: CommandRegistry

  constructor(registry: CommandRegistry) {
    this.registry = registry
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const initial = pickTab(args[0])
    const initialIdx = TABS.indexOf(initial)
    const specs = this.registry.allSpecs()
    const sectionsByTab = TABS.map((tab) => sectionsFor(tab, specs))

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: 'Commands',
        tabs: { items: TABS as readonly string[], active: initialIdx },
        sections: sectionsByTab[initialIdx],
        sectionsByTab,
      })
      return true
    }

    const lines: string[] = [`Commands — ${initial}`]
    for (const s of sectionsByTab[initialIdx]) {
      if (s.title) lines.push('', s.title)
      const w = Math.max(...s.rows.map((r) => r.key.length))
      for (const r of s.rows) lines.push(`  ${r.key.padEnd(w)}  ${r.value}`)
    }
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}

function pickTab(arg?: string): TabName {
  const normalized = arg?.toLowerCase()
  for (const t of TABS) if (t.toLowerCase() === normalized) return t
  return 'All'
}

function sectionsFor(tab: TabName, specs: readonly SlashCommandSpec[]): UiCardSection[] {
  if (tab === 'All') {
    const groups = ['Core', 'Workspace', 'Server', 'Auth', 'Tools'] as const
    return groups.map((g) => ({ title: g, rows: rowsForCategory(specs, g) })).filter((s) => s.rows.length > 0)
  }
  return [{ rows: rowsForCategory(specs, tab) }]
}

function rowsForCategory(specs: readonly SlashCommandSpec[], category: TabName): UiKVRow[] {
  return specs
    .filter((s) => CATEGORY[s.name] === category)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const hint = s.argumentHint ? ` ${s.argumentHint}` : ''
      const aliases = s.aliases.length > 0 ? ` (${s.aliases.join(', ')})` : ''
      return {
        key: `/${s.name}${hint}`,
        value: `${s.summary}${aliases}`,
      }
    })
}
