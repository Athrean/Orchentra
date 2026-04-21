import type { PatternMatch } from './types'

export function formatPatternContext(matches: PatternMatch[]): string {
  if (matches.length === 0) return ''

  const sections = matches.map((m) => {
    const pct = Math.round(m.similarity * 100)
    return [
      `### Match (${pct}% similar)`,
      `**Failure pattern:** ${m.entry.pattern}`,
      `**Resolution:** ${m.entry.resolution}`,
      `**Failure type:** ${m.entry.failureType}`,
    ].join('\n')
  })

  return ['## Similar Past Incidents', '', ...sections].join('\n\n')
}
