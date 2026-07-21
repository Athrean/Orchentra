import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { CommandRegistry } from '../registry'
import type { UiCardSection, UiKVRow } from '../ui-output'

const TABS = ['All', 'Core', 'Workspace', 'Auth', 'Tools'] as const
type TabName = (typeof TABS)[number]

const QUICK_HINTS: UiCardSection = {
  title: 'Quick hints',
  rows: [
    { key: 'Newline', value: 'Shift+Enter or Alt+Enter' },
    { key: 'Editor', value: 'Ctrl+X' },
    { key: 'Palette', value: 'Ctrl+P' },
    { key: 'Mode', value: 'Shift+Tab' },
    { key: 'Runtime', value: 'inline TUI; BYOK billing' },
    { key: 'Usage', value: '/usage shows tokens and estimated cost' },
  ],
}

const BUILTIN_CATEGORY: Record<string, TabName> = {
  help: 'Core',
  status: 'Core',
  clear: 'Core',
  exit: 'Core',
  compact: 'Core',
  model: 'Core',
  effort: 'Core',
  version: 'Core',
  cost: 'Core',
  plan: 'Core',
  planmode: 'Core',
  think: 'Core',
  terse: 'Core',
  budget: 'Core',
  memory: 'Core',
  forget: 'Core',
  debug: 'Workspace',
  diff: 'Workspace',
  commit: 'Workspace',
  pr: 'Workspace',
  issue: 'Workspace',
  session: 'Workspace',
  resume: 'Workspace',
  scan: 'Workspace',
  review: 'Workspace',
  build: 'Workspace',
  lean: 'Workspace',
  search: 'Workspace',
  init: 'Workspace',
  skills: 'Workspace',
  restart: 'Workspace',
  login: 'Auth',
  logout: 'Auth',
  reauth: 'Auth',
  'auth-status': 'Auth',
  mcp: 'Tools',
  permissions: 'Tools',
  doctor: 'Tools',
  config: 'Tools',
  export: 'Tools',
}

function categoryFor(name: string): TabName | null {
  if (name in BUILTIN_CATEGORY) return BUILTIN_CATEGORY[name]
  return null
}

export class HelpCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'help',
    aliases: ['?', 'h'],
    summary: 'List slash commands grouped by category',
    argumentHint: '[all|core|workspace|auth|tools]',
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
    const groups = ['Core', 'Workspace', 'Auth', 'Tools'] as const
    return [
      ...groups.flatMap((g) => {
        const rows = rowsForCategory(specs, g)
        return rows.length > 0 ? [{ title: g, rows }] : []
      }),
      QUICK_HINTS,
    ]
  }
  const sections: UiCardSection[] = [{ rows: rowsForCategory(specs, tab) }]
  if (tab === 'Core') sections.push(QUICK_HINTS)
  return sections
}

function rowsForCategory(specs: readonly SlashCommandSpec[], category: TabName): UiKVRow[] {
  return specs
    .filter((s) => categoryFor(s.name) === category)
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
