import type { ContextBreakdown, ContextFile, ContextStats, SpineSavings, UsageTotals } from '@orchentra/cli-core'
import type { UiCardSection } from '../ui-output'

export interface ContextReport {
  readonly stats: ContextStats
  readonly usage: UsageTotals
  readonly turns: number
  readonly savings?: SpineSavings
  /** Per-source detail: which tool schemas and re-read files fill the window. */
  readonly breakdown?: ContextBreakdown
  /** Every distinct file loaded into context via read_file, most-read first. */
  readonly files?: readonly ContextFile[]
}

const DEFAULT_WINDOW = 200_000
const DEFAULT_THRESHOLD = 0.8

/** ASCII meter for a 0..1 ratio, clamped. Glyphs only — the card renders the
 * value as text, so no colour literal is introduced (§8). */
export function renderMeter(ratio: number, width = 20): string {
  const r = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0))
  const filled = Math.round(r * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/**
 * Build the `/context` card: how full the window is, distance to the
 * compaction threshold, and the measured savings the context-budget spine has
 * already banked — so budget is inspectable, not just spent.
 */
export function buildContextSections(report: ContextReport): UiCardSection[] {
  const { estimatedTokens, messages } = report.stats
  const window =
    report.stats.contextWindowTokens && report.stats.contextWindowTokens > 0
      ? report.stats.contextWindowTokens
      : DEFAULT_WINDOW
  const thresholdRatio = report.stats.compactThresholdRatio ?? DEFAULT_THRESHOLD
  const usedRatio = estimatedTokens / window
  const pct = Math.round(usedRatio * 100)
  const thresholdTokens = Math.round(window * thresholdRatio)
  const thresholdPct = Math.round(thresholdRatio * 100)
  const overThreshold = estimatedTokens >= thresholdTokens
  const remaining = Math.max(0, thresholdTokens - estimatedTokens)

  const total = report.usage.inputTokens + report.usage.outputTokens
  const sections: UiCardSection[] = [
    {
      title: 'Context window',
      rows: [
        { key: 'Estimated tokens', value: `${fmt(estimatedTokens)} / ${fmt(window)}` },
        { key: 'Used', value: `${renderMeter(usedRatio)} ${pct}%` },
        { key: 'Compaction at', value: `${thresholdPct}% · ${fmt(thresholdTokens)} tokens` },
        {
          key: 'Remaining',
          value: overThreshold ? 'over threshold — compaction imminent' : `${fmt(remaining)} tokens left`,
          bold: overThreshold,
        },
        { key: 'Messages in context', value: fmt(messages) },
        ...(report.files ? [{ key: 'Files in context', value: fmt(report.files.length) }] : []),
      ],
    },
    {
      title: 'Session',
      rows: [
        { key: 'Turns', value: fmt(report.turns) },
        { key: 'Input tokens', value: fmt(report.usage.inputTokens) },
        { key: 'Output tokens', value: fmt(report.usage.outputTokens) },
        { key: 'Total', value: fmt(total), bold: true },
      ],
    },
  ]

  const tools = toolSourcesSection(report.breakdown)
  if (tools) sections.push(tools)
  const dups = duplicateReadsSection(report.breakdown)
  if (dups) sections.push(dups)
  const files = filesSection(report.files)
  if (files) sections.push(files)

  const savings = savingsSection(report.savings)
  if (savings) sections.push(savings)
  return sections
}

/** Every distinct file loaded into context, most-read first — capped so a
 * long session doesn't blow out the card. Hidden when nothing was read. */
function filesSection(files?: readonly ContextFile[]): UiCardSection | undefined {
  if (!files || files.length === 0) return undefined
  const CAP = 20
  const shown = files.slice(0, CAP)
  const rows = shown.map((f) => ({ key: f.path, value: f.reads > 1 ? `${f.reads}×` : '' }))
  if (files.length > CAP) rows.push({ key: `…and ${files.length - CAP} more`, value: '' })
  return { title: 'Files read into context', rows }
}

/** Tool schemas re-sent on every request, grouped by source (biggest first) so
 * an MCP server bloating the window is obvious. Hidden when no tools load. */
function toolSourcesSection(breakdown?: ContextBreakdown): UiCardSection | undefined {
  const sources = breakdown?.toolSources ?? []
  if (sources.length === 0) return undefined
  return {
    title: 'Tool schemas',
    rows: sources.map((s) => ({
      key: s.server,
      value: `${fmt(s.tools)} tool${s.tools === 1 ? '' : 's'} · ~${fmt(s.estimatedTokens)} tokens`,
    })),
  }
}

/** Files read more than once — each repeat reloads content already in context.
 * Hidden unless at least one file was re-read. */
function duplicateReadsSection(breakdown?: ContextBreakdown): UiCardSection | undefined {
  const dups = breakdown?.duplicateReads ?? []
  if (dups.length === 0) return undefined
  return {
    title: 'Re-read files',
    rows: dups.map((d) => ({ key: d.path, value: `read ${fmt(d.reads)}×` })),
  }
}

function savingsSection(savings?: SpineSavings): UiCardSection | undefined {
  if (!savings) return undefined
  if (savings.compactions === 0 && savings.toolOutputTrims === 0) return undefined
  return {
    title: 'Spine savings so far',
    rows: [
      {
        key: 'Compaction',
        value: `${savings.compactions} run(s) · ${fmt(savings.compactionTokensSaved)} tokens saved`,
      },
      {
        key: 'Tool trims',
        value: `${savings.toolOutputTrims} trim(s) · ${fmt(savings.toolOutputCharsTrimmed)} chars trimmed`,
      },
    ],
  }
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}
