import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import { THIRD_PARTY_PROVIDERS } from '../../login/state-machine'

export interface ThirdPartyPickerCardProps {
  readonly cursor: number
}

export function ThirdPartyPickerCard(props: ThirdPartyPickerCardProps): React.ReactElement {
  const labelW = THIRD_PARTY_PROVIDERS.reduce((m, r) => Math.max(m, r.label.length), 0)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Login
      </Text>
      <Text dimColor>Using a 3rd-party platform · opens vendor docs</Text>
      <Box height={1} />
      {THIRD_PARTY_PROVIDERS.map((row, i) => {
        const active = i === props.cursor
        return (
          <Box key={row.provider} flexDirection="row">
            <Text color={active ? THEME.brand : undefined}>{active ? '❯ ' : '  '}</Text>
            <Text color={active ? THEME.brand : undefined} bold={active}>
              {row.label.padEnd(labelW, ' ')}
            </Text>
            <Text dimColor>{`  ${row.docsUrl}`}</Text>
          </Box>
        )
      })}
      <Box height={1} />
      <Text dimColor>↑/↓ to move · Enter opens docs · Esc to go back</Text>
    </Box>
  )
}
