import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import { API_KEY_PROVIDERS, type ApiKeyProvider } from '../../login/state-machine'

export interface ApiKeyInputCardProps {
  readonly provider: ApiKeyProvider
  readonly buffer: string
  readonly error: string | null
  readonly saving: boolean
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function ApiKeyInputCard(props: ApiKeyInputCardProps): React.ReactElement {
  const row = API_KEY_PROVIDERS.find((r) => r.provider === props.provider)
  const label = row?.label ?? props.provider
  const masked = '*'.repeat(props.buffer.length)
  const spinnerIdx = Math.floor(Date.now() / 100) % SPINNER.length
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Sign in to {label}
      </Text>
      <Text dimColor>API key saved to the OS keychain</Text>
      <Box height={1} />
      <Box flexDirection="row">
        <Text>API key </Text>
        <Text color={THEME.accent}>›</Text>
        <Text> {masked}</Text>
        <Text color={THEME.accent}>█</Text>
      </Box>
      {props.error ? (
        <Box marginTop={1}>
          <Text color={THEME.danger}>{`✗ ${props.error}`}</Text>
        </Box>
      ) : null}
      {props.saving ? (
        <Box marginTop={1}>
          <Text color={THEME.accent}>{`${SPINNER[spinnerIdx]} saving…`}</Text>
        </Box>
      ) : null}
      <Box height={1} />
      <Text dimColor>Enter to save · Esc to go back</Text>
    </Box>
  )
}
