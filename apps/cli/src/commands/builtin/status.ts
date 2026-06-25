import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { formatUsd, pricingForModel } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiCardSection } from '../ui-output'
import { CLI_NAME, CLI_VERSION } from '../../version'

const TABS = ['Status', 'Config', 'Usage', 'Stats'] as const
type TabName = (typeof TABS)[number]

export class StatusCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'status',
    aliases: ['st'],
    summary: 'Inspect session — status, config, usage, stats',
    argumentHint: '[status|config|usage|stats]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const initial = pickTab(args[0])
    const initialIdx = TABS.indexOf(initial)
    const sectionsByTab = TABS.map((tab) => sectionsFor(tab, ctx))

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: `${capitalize(CLI_NAME)} ${CLI_VERSION}`,
        subtitle: ctx.session.getModel(),
        tabs: { items: TABS as readonly string[], active: initialIdx },
        sections: sectionsByTab[initialIdx],
        sectionsByTab,
      })
      return true
    }

    // Plaintext fallback for one-shot CLI surfaces.
    const lines: string[] = [`${capitalize(CLI_NAME)} ${CLI_VERSION} — ${initial}`]
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
  return 'Status'
}

function sectionsFor(tab: TabName, ctx: CommandContext): UiCardSection[] {
  const session = ctx.session
  switch (tab) {
    case 'Status':
      return [
        {
          rows: [
            { key: 'Version', value: CLI_VERSION },
            { key: 'Session ID', value: session.getSessionId() },
            { key: 'cwd', value: prettyCwd(ctx.cwd) },
            { key: 'Model', value: session.getModel() },
            { key: 'Provider', value: detectProvider() },
            { key: 'Permission mode', value: session.getPermissionMode() },
            { key: 'Terse mode', value: session.getTerseMode?.() ?? 'off' },
            { key: 'Setting sources', value: detectSettingSources(ctx.cwd) },
          ],
        },
      ]
    case 'Config':
      return [
        {
          rows: [
            { key: 'Default model', value: session.getModel() },
            { key: 'Permission mode', value: session.getPermissionMode() },
            { key: 'Terse mode', value: session.getTerseMode?.() ?? 'off' },
            { key: 'Server URL', value: process.env.ORCHENTRA_SERVER_URL ?? 'http://localhost:3001' },
            { key: 'Org ID', value: process.env.ORCHENTRA_ORG_ID ?? '<unset>' },
            { key: 'Theme', value: 'Dark mode' },
          ],
        },
      ]
    case 'Usage': {
      const u = session.getUsage()
      const total = u.inputTokens + u.outputTokens
      return [
        {
          title: 'Tokens',
          rows: [
            { key: 'Input', value: formatNumber(u.inputTokens) },
            { key: 'Output', value: formatNumber(u.outputTokens) },
            { key: 'Cache create', value: formatNumber(u.cacheCreationTokens) },
            { key: 'Cache read', value: formatNumber(u.cacheReadTokens) },
            { key: 'Total', value: formatNumber(total), bold: true },
          ],
        },
      ]
    }
    case 'Stats': {
      const u = session.getUsage()
      const pricing = pricingForModel(session.getModel())
      const cost = pricing
        ? formatUsd(
            (u.inputTokens / 1_000_000) * pricing.inputCostPerMillion +
              (u.outputTokens / 1_000_000) * pricing.outputCostPerMillion,
          )
        : 'unavailable'
      return [
        {
          title: 'Session',
          rows: [
            { key: 'Turns', value: String(session.getTurns()) },
            { key: 'Estimated cost', value: cost },
          ],
        },
      ]
    }
  }
}

function detectProvider(): string {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'anthropic'
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini'
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.XAI_API_KEY) return 'xai'
  return 'anthropic'
}

function detectSettingSources(cwd: string): string {
  const sources: string[] = []
  try {
    if (existsSync(join(homedir(), '.orchentra'))) sources.push('User settings')
    if (existsSync(join(cwd, '.orchentra'))) sources.push('Project local settings')
  } catch {
    /* ignore */
  }
  return sources.length === 0 ? 'none' : sources.join(', ')
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function capitalize(s: string): string {
  if (s.length === 0) return s
  return s[0].toUpperCase() + s.slice(1)
}

function prettyCwd(cwd: string): string {
  const home = homedir()
  if (home && cwd === home) return '~'
  if (home && cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`
  return cwd
}
