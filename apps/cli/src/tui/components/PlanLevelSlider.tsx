import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { PLAN_LEVELS, type PlanLevel } from '@orchentra/cli-core'
import { THEME } from '../theme'

export interface PlanLevelSliderProps {
  readonly current: PlanLevel
  readonly onPick: (level: PlanLevel) => void
  readonly onCancel: () => void
}

const BLURB: Record<PlanLevel, string> = {
  core: 'tightest plan, fewest words',
  plus: 'balanced (default)',
  max: 'exhaustive: tradeoffs, risks, deep rationale',
}

/** Horizontal plan-depth slider: Tighter ←→ Deeper, ←/→ to adjust. */
export function PlanLevelSlider(props: PlanLevelSliderProps): React.ReactElement {
  const initial = Math.max(0, PLAN_LEVELS.indexOf(props.current))
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
        setIndex((i) => Math.min(PLAN_LEVELS.length - 1, i + 1))
        return
      }
      if (key.return) {
        props.onPick(PLAN_LEVELS[index])
        return
      }
    },
    { isActive: true },
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Plan depth
      </Text>
      <Box height={1} />
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>Tighter</Text>
        <Text dimColor>Deeper</Text>
      </Box>
      <Box flexDirection="row" gap={2}>
        {PLAN_LEVELS.map((level, i) => {
          const active = i === index
          return (
            <Text key={level} color={active ? THEME.brand : undefined} bold={active} dimColor={!active}>
              {active ? `[${level}]` : level}
            </Text>
          )
        })}
      </Box>
      <Box height={1} />
      <Text dimColor>{BLURB[PLAN_LEVELS[index]]}</Text>
      <Text dimColor>←/→ to adjust · Enter to confirm · Esc to cancel</Text>
    </Box>
  )
}
