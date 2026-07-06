import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'

export interface QueuedMessagesProps {
  readonly queued: readonly string[]
}

/**
 * Dim preview of messages typed ahead while a turn is running, shown above the
 * input. They submit in order once the runtime goes idle. Rendered muted so
 * they read as pending, not active (§8: don't compete for visual weight).
 */
export function QueuedMessages(props: QueuedMessagesProps): React.ReactElement | null {
  if (props.queued.length === 0) return null
  return (
    <Box flexDirection="column" paddingX={1}>
      {props.queued.map((msg, i) => (
        <Text key={i} color={THEME.muted}>
          {`${THEME.arrowRight} queued  ${oneLine(msg)}`}
        </Text>
      ))}
    </Box>
  )
}

function oneLine(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
