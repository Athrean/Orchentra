import React from 'react'
import { Text } from 'ink'
import { THEME } from '../theme'

export interface ShimmerTextProps {
  readonly text: string
  readonly frame: number
  readonly bold?: boolean
}

const BAND_WIDTH = 5

export interface ShimmerSpan {
  readonly ch: string
  readonly hilite: boolean
}

// A travelling highlight band sweeps across the text. Returns one span per
// char so callers (or tests) can decide how to colorize. The band wraps so
// the effect loops smoothly while a turn is running.
export function shimmerSpansFor(text: string, frame: number): ShimmerSpan[] {
  const len = text.length
  if (len === 0) return []
  const period = len + BAND_WIDTH
  const center = (frame % period) - BAND_WIDTH / 2
  const spans: ShimmerSpan[] = []
  for (let i = 0; i < len; i++) {
    const dist = Math.abs(i - center)
    spans.push({ ch: text[i], hilite: dist < BAND_WIDTH / 2 })
  }
  return spans
}

export function ShimmerText(props: ShimmerTextProps): React.ReactElement {
  const { text, frame, bold } = props
  const spans = shimmerSpansFor(text, frame)
  if (spans.length === 0) return <Text></Text>

  return (
    <Text bold={bold}>
      {spans.map((span, i) =>
        span.hilite ? (
          <Text key={i} color={THEME.brandDim} bold={bold}>
            {span.ch}
          </Text>
        ) : (
          <Text key={i} color={THEME.brand} dimColor>
            {span.ch}
          </Text>
        ),
      )}
    </Text>
  )
}
