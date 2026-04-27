import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'

export interface TabsProps {
  readonly items: readonly string[]
  readonly active: number
  readonly accent?: string
}

/**
 * Text-based tab strip. Active tab is bracketed and brand-coloured; inactive
 * tabs render dim. Used as a visual nav above structured slash-command
 * output cards.
 */
export function Tabs(props: TabsProps): React.ReactElement {
  const accent = props.accent ?? THEME.brand
  return (
    <Box flexDirection="row">
      {props.items.map((item, i) => {
        const isActive = i === props.active
        return (
          <React.Fragment key={item}>
            {isActive ? (
              <Text color={accent} bold>
                {`[ ${item} ]`}
              </Text>
            ) : (
              <Text dimColor>{`  ${item}  `}</Text>
            )}
          </React.Fragment>
        )
      })}
    </Box>
  )
}
