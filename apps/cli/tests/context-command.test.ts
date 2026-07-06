import { describe, expect, test } from 'bun:test'
import { buildContextSections, renderMeter, type ContextReport } from '../src/commands/builtin/context-report'
import { ContextCommand } from '../src/commands/builtin/terminal-parity'
import type { CommandContext } from '../src/commands/registry'
import type { SessionControl, SpineSavings, UsageTotals } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'

const usage: UsageTotals = { inputTokens: 1200, outputTokens: 800, cacheReadTokens: 0, cacheCreationTokens: 0 }

const report = (over?: Partial<ContextReport>): ContextReport => ({
  stats: { messages: 12, estimatedTokens: 100_000, contextWindowTokens: 200_000, compactThresholdRatio: 0.8 },
  usage,
  turns: 4,
  ...over,
})

describe('renderMeter', () => {
  test('empty, half, and full', () => {
    expect(renderMeter(0, 10)).toBe('░'.repeat(10))
    expect(renderMeter(1, 10)).toBe('█'.repeat(10))
    expect(renderMeter(0.5, 10)).toBe('█'.repeat(5) + '░'.repeat(5))
  })

  test('clamps out-of-range and non-finite ratios', () => {
    expect(renderMeter(2, 10)).toBe('█'.repeat(10))
    expect(renderMeter(-1, 10)).toBe('░'.repeat(10))
    expect(renderMeter(NaN, 10)).toBe('░'.repeat(10))
  })
})

describe('buildContextSections', () => {
  test('reports usage %, compaction threshold, and remaining room', () => {
    const text = JSON.stringify(buildContextSections(report()))
    expect(text).toContain('100,000 / 200,000')
    expect(text).toContain('50%')
    expect(text).toContain('80% · 160,000 tokens')
    expect(text).toContain('60,000 tokens')
    expect(text).toContain('12')
  })

  test('defaults window + threshold when the provider omits them', () => {
    const text = JSON.stringify(buildContextSections(report({ stats: { messages: 3, estimatedTokens: 50_000 } })))
    expect(text).toContain('50,000 / 200,000') // default window
    expect(text).toContain('80% · 160,000 tokens') // default threshold
  })

  test('flags when already over the compaction threshold', () => {
    const text = JSON.stringify(
      buildContextSections(
        report({
          stats: { messages: 30, estimatedTokens: 170_000, contextWindowTokens: 200_000, compactThresholdRatio: 0.8 },
        }),
      ),
    )
    expect(text).toContain('over threshold')
  })

  test('hides spine savings when nothing was saved, shows it when non-zero', () => {
    const zero: SpineSavings = {
      compactions: 0,
      compactionTokensSaved: 0,
      toolOutputTrims: 0,
      toolOutputCharsTrimmed: 0,
    }
    expect(JSON.stringify(buildContextSections(report({ savings: zero })))).not.toContain('Spine savings')
    const some: SpineSavings = {
      compactions: 2,
      compactionTokensSaved: 8000,
      toolOutputTrims: 3,
      toolOutputCharsTrimmed: 5000,
    }
    const text = JSON.stringify(buildContextSections(report({ savings: some })))
    expect(text).toContain('Spine savings so far')
    expect(text).toContain('2 run(s)')
  })
})

function makeCtx(withStats: boolean): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  const session = {
    getModel: () => 'sonnet',
    getTurns: () => 4,
    getUsage: () => usage,
    getContextStats: withStats
      ? () => ({ messages: 12, estimatedTokens: 100_000, contextWindowTokens: 200_000, compactThresholdRatio: 0.8 })
      : undefined,
    getSavings: () => ({ compactions: 0, compactionTokensSaved: 0, toolOutputTrims: 0, toolOutputCharsTrimmed: 0 }),
    clearHistory: () => {},
    forceCompact: () => {},
  } as unknown as SessionControl
  return { events, ctx: { cwd: '/w', session, ui: (o) => events.push(o) } }
}

describe('ContextCommand (enhanced)', () => {
  test('renders a Context card with the window breakdown', async () => {
    const { ctx, events } = makeCtx(true)
    await new ContextCommand().execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    expect(ev.title).toBe('Context')
    expect(JSON.stringify(ev)).toContain('Context window')
    expect(JSON.stringify(ev)).toContain('50%')
  })

  test('warns when context stats are unavailable', async () => {
    const { ctx, events } = makeCtx(false)
    await new ContextCommand().execute([], ctx)
    expect(events[0].kind).toBe('note')
  })
})
