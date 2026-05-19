import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import { API_KEY_PROVIDERS, type ApiKeyProvider } from '../../login/state-machine'

export interface ApiKeyPickerCardProps {
  readonly cursor: number
  readonly signedIn: ReadonlySet<ApiKeyProvider>
}

export function ApiKeyPickerCard(props: ApiKeyPickerCardProps): React.ReactElement {
  const labelW = API_KEY_PROVIDERS.reduce((m, r) => Math.max(m, r.label.length), 0)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Login
      </Text>
      <Text dimColor>Using an API key — pay-per-token billing</Text>
      <Box height={1} />
      {API_KEY_PROVIDERS.map((row, i) => {
        const active = i === props.cursor
        const stored = props.signedIn.has(row.provider)
        return (
          <Box key={row.provider} flexDirection="row">
            <Text color={active ? THEME.brand : undefined}>{active ? '❯ ' : '  '}</Text>
            <Text color={active ? THEME.brand : undefined} bold={active}>
              {row.label.padEnd(labelW, ' ')}
            </Text>
            <Text dimColor>{`  ${row.hint}`}</Text>
            {stored ? <Text color={THEME.brand}>{'  (signed in)'}</Text> : null}
          </Box>
        )
      })}
      <Box height={1} />
      <Text dimColor>↑/↓ to move · Enter to select · Esc to go back</Text>
    </Box>
  )
}
