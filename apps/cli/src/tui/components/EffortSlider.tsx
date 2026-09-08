import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { EFFORT_TIERS, type EffortTier } from '@orchentra/cli-core'
import { THEME } from '../theme'

export interface EffortSliderProps {
  readonly current: EffortTier
  readonly onPick: (effort: EffortTier) => void
  readonly onCancel: () => void
}

/** Blank columns between two tier labels. */
const GAP = 5

export interface EffortStop {
  readonly tier: EffortTier
  /** Column the label starts at. */
  readonly start: number
  /** Column the marker sits on — the label's own midpoint. */
  readonly center: number
}

export interface EffortLayout {
  readonly width: number
  readonly stops: readonly EffortStop[]
}

/**
 * Column positions for the track and the labels, computed once.
 *
 * The two rows used to be laid out independently — the track drew a tick every
 * ten columns while the labels were spaced by a flexbox gap — so the marker
 * pointed between names instead of at one, and the further right the tier the
 * worse the drift (`max` put the marker past the end of the track entirely).
 * Deriving both rows from these stops makes that class of bug unrepresentable.
 */
export function effortLayout(tiers: readonly EffortTier[] = EFFORT_TIERS, gap: number = GAP): EffortLayout {
  let x = 0
  const stops = tiers.map((tier) => {
    const start = x
    x += tier.length + gap
    return { tier, start, center: start + Math.floor((tier.length - 1) / 2) }
  })
  return { width: Math.max(0, x - gap), stops }
}

/** The track as two spans around the marker, so only the marker takes colour. */
export function trackSpans(layout: EffortLayout, activeIndex: number): { before: string; after: string } {
  const center = layout.stops[activeIndex]?.center ?? 0
  return {
    before: THEME.rule.repeat(center),
    after: THEME.rule.repeat(Math.max(0, layout.width - center - 1)),
  }
}

/** Claude-style horizontal effort slider: Faster ←→ Smarter, ←/→ to adjust. */
export function EffortSlider(props: EffortSliderProps): React.ReactElement {
  const initial = Math.max(0, EFFORT_TIERS.indexOf(props.current))
  const [index, setIndex] = useState(initial)
  const layout = effortLayout()
  const { before, after } = trackSpans(layout, index)

  useInput(
    (input, key) => {
      if (key.escape || (key.ctrl && input === 'c')) {
        props.onCancel()
        return
      }
      if (key.leftArrow) {
        setIndex((i) => Math.max(0, i - 1))
        return
      }
      if (key.rightArrow) {
        setIndex((i) => Math.min(EFFORT_TIERS.length - 1, i + 1))
        return
      }
      if (key.return) {
        const picked = EFFORT_TIERS[index]
        if (picked) props.onPick(picked)
      }
    },
    { isActive: true },
  )

  const header = 'Faster'.padEnd(Math.max(7, layout.width - 'Smarter'.length)) + 'Smarter'

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>{THEME.rule.repeat(layout.width)}</Text>
      <Text color={THEME.brand} bold>
        Effort
      </Text>
      <Box height={1} />
      <Text dimColor>{header}</Text>
      <Box flexDirection="row">
        <Text dimColor>{before}</Text>
        <Text color={THEME.brand}>▲</Text>
        <Text dimColor>{after}</Text>
      </Box>
      <Box flexDirection="row">
        {layout.stops.map((stop, i) => (
          <React.Fragment key={stop.tier}>
            {i > 0 ? <Text>{' '.repeat(GAP)}</Text> : null}
            <Text color={i === index ? THEME.brand : undefined} bold={i === index} dimColor={i !== index}>
              {stop.tier}
            </Text>
          </React.Fragment>
        ))}
      </Box>
      <Box height={1} />
      <Text dimColor>←/→ to adjust · Enter to confirm · Esc to cancel</Text>
    </Box>
  )
}
