import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { EFFORT_TIERS, type EffortTier } from '@orchentra/cli-core'
import { THEME } from '../theme'

export interface EffortSliderProps {
  readonly current: EffortTier
  readonly onPick: (effort: EffortTier) => void
  readonly onCancel: () => void
}

/** Claude-style horizontal effort slider: Faster ←→ Smarter, ←/→ to adjust. */
export function EffortSlider(props: EffortSliderProps): React.ReactElement {
  const initial = Math.max(0, EFFORT_TIERS.indexOf(props.current))
  const [index, setIndex] = useState(initial)

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
        props.onPick(EFFORT_TIERS[index])
        return
      }
    },
    { isActive: true },
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Effort
      </Text>
      <Box height={1} />
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>Faster</Text>
        <Text dimColor>Smarter</Text>
      </Box>
      <Box flexDirection="row" gap={2}>
        {EFFORT_TIERS.map((tier, i) => {
          const active = i === index
          return (
            <Text key={tier} color={active ? THEME.brand : undefined} bold={active} dimColor={!active}>
              {active ? `[${tier}]` : tier}
            </Text>
          )
        })}
      </Box>
      <Box height={1} />
      <Text dimColor>←/→ to adjust · Enter to confirm · Esc to cancel</Text>
    </Box>
  )
}
