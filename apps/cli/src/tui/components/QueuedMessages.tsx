import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'

export interface QueuedMessagesProps {
  readonly queued: readonly string[]
}

/**
 * Dim preview of messages typed ahead while a turn is running, shown above the
 * input. They submit in order once the runtime goes idle. A header names the
 * count and the recall affordance (↑ pulls the newest back into the buffer to
 * edit or drop). Rendered muted so it reads as pending, not active (§8: don't
 * compete for visual weight).
 */
export function QueuedMessages(props: QueuedMessagesProps): React.ReactElement | null {
  if (props.queued.length === 0) return null
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={THEME.muted}>{`${props.queued.length} queued  ${THEME.separator}  ↑ to edit`}</Text>
      {props.queued.map((msg, i) => (
        <Text key={i} color={THEME.muted}>
          {`${THEME.arrowRight} ${oneLine(msg)}`}
        </Text>
      ))}
    </Box>
  )
}

function oneLine(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
