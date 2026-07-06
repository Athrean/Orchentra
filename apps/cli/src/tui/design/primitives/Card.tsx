import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../../theme'

export interface CardProps {
  readonly title?: string
  readonly subtitle?: string
  readonly children: React.ReactNode
  /** Override border colour. Defaults to brand. */
  readonly accent?: string
  /** Tight = paddingY 0; loose = paddingY 1. Defaults to tight. */
  readonly density?: 'tight' | 'loose'
}

export function Card(props: CardProps): React.ReactElement {
  const accent = props.accent ?? THEME.brand
  const padY = props.density === 'loose' ? 1 : 0

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1} paddingY={padY}>
      {props.title || props.subtitle ? (
        <Box flexDirection="row">
          {props.title ? (
            <Text color={accent} bold>
              {props.title}
            </Text>
          ) : null}
          {props.subtitle ? (
            <>
              <Text>{'  '}</Text>
              <Text dimColor>{props.subtitle}</Text>
            </>
          ) : null}
        </Box>
      ) : null}
      <Box flexDirection="column">{props.children}</Box>
    </Box>
  )
}
