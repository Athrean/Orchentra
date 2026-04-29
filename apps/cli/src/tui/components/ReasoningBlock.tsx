import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import type { ReasoningRow } from '../types'

export interface ReasoningBlockProps {
  readonly row: ReasoningRow
}

export function ReasoningBlock(props: ReasoningBlockProps): React.ReactElement {
  const { row } = props
  const elapsedMs = (row.endedAt ?? Date.now()) - row.startedAt
  const elapsed = formatDuration(elapsedMs)
  const streaming = row.endedAt === null

  if (!row.expanded) {
    const summary = streaming ? `thinking… ${elapsed}` : `thought for ${elapsed}`
    return (
      <Box paddingX={1} flexDirection="row">
        <Text color={THEME.brand}>✦ </Text>
        <Text color={THEME.brand} dimColor>
          {summary}
        </Text>
        {!streaming ? (
          <Text dimColor>
            {'  '}
            {THEME.bullet} ctrl+r to expand
          </Text>
        ) : null}
      </Box>
    )
  }

  const lines = row.text.split('\n')
  return (
    <Box paddingX={1} flexDirection="column">
      <Box flexDirection="row">
        <Text color={THEME.brand}>✦ </Text>
        <Text color={THEME.brand} bold>
          reasoning
        </Text>
        <Text dimColor>{`  ${THEME.bullet}  ${elapsed}  ${THEME.bullet}  ctrl+r to collapse`}</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {lines.map((line, i) => (
          <Text key={i} dimColor italic>
            {line.length === 0 ? ' ' : line}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, ms)}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m${s % 60}s`
}
