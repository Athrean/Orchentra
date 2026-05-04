import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import type { ReasoningRow } from '../types'
import { CollapsibleBlock } from './CollapsibleBlock'
import { verbForId } from './loading-verbs'

export interface ReasoningBlockProps {
  readonly row: ReasoningRow
}

export function ReasoningBlock(props: ReasoningBlockProps): React.ReactElement {
  const { row } = props
  const elapsedMs = (row.endedAt ?? Date.now()) - row.startedAt
  const elapsed = formatDuration(elapsedMs)
  const streaming = row.endedAt === null
  const verb = verbForId(row.id)

  if (!row.expanded) {
    const summary = streaming ? `${verb}… ${elapsed}` : `${verb} for ${elapsed}`
    return (
      <Box paddingX={1} flexDirection="row">
        <Text color={THEME.brand}>* </Text>
        <Text color={THEME.brand} dimColor italic>
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

  const lines = row.text.split('\n').map((l) => (l.length === 0 ? ' ' : l))
  return (
    <Box paddingX={1} flexDirection="column">
      <Box flexDirection="row">
        <Text color={THEME.brand}>* </Text>
        <Text color={THEME.brand} bold italic>
          {`${verb} for ${elapsed}`}
        </Text>
        <Text dimColor>{`  ${THEME.bullet}  ctrl+r to collapse`}</Text>
      </Box>
      <Box marginLeft={2}>
        <CollapsibleBlock
          lines={lines}
          expanded={true}
          collapsedTo={lines.length}
          collapseHint="(ctrl+r to collapse)"
          expandHint="(ctrl+r to expand)"
        />
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
