import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'

export interface TabsProps {
  readonly items: readonly string[]
  readonly active: number
  readonly accent?: string
}

/**
 * Text tab strip. The active tab is rendered as a brand-coloured "pill"
 * (inverse text), inactive tabs render in the default colour. Spacing
 * between items mirrors Claude Code's status surface.
 */
export function Tabs(props: TabsProps): React.ReactElement {
  const accent = props.accent ?? THEME.brand
  return (
    <Box flexDirection="row">
      {props.items.map((item, i) => {
        const isActive = i === props.active
        const padded = ` ${item} `
        return (
          <React.Fragment key={item}>
            {isActive ? (
              <Text color={accent} inverse bold>
                {padded}
              </Text>
            ) : (
              <Text>{padded}</Text>
            )}
            {i < props.items.length - 1 ? <Text>{'  '}</Text> : null}
          </React.Fragment>
        )
      })}
    </Box>
  )
}
