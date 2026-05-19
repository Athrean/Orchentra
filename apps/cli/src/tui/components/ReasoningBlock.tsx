import React, { useRef } from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import type { ReasoningRow } from '../types'
import { CollapsibleBlock } from './CollapsibleBlock'
import { verbForId } from './loading-verbs'
import { pickShimmer, useShimmer } from '../hooks/use-shimmer'

export interface ReasoningBlockProps {
  readonly row: ReasoningRow
}

// Two-stop palette for the shimmer cycle while streaming. Reads the existing
// theme tokens — `theme.ts` already exports both. The cycle goes brand →
// brandDim → brand → … on a fixed interval, giving a soft "breathing" pulse.
const SHIMMER_PALETTE = [THEME.brand, THEME.brandDim] as const

// Once the underlying stream has been quiet for this long, surface an
// elapsed counter so the user can see how long they have been waiting.
const IDLE_REVEAL_MS = 2000

export function ReasoningBlock(props: ReasoningBlockProps): React.ReactElement {
  const { row } = props
  const streaming = row.endedAt === null
  const verb = verbForId(row.id)

  // Track the timestamp of the last text update. We don't have a real event
  // here — instead, watch `row.text` across renders and snap the ref each
  // time it changes. Initialised to `row.startedAt` so a row mounted with
  // pre-existing stale text correctly reports as idle.
  const lastUpdateRef = useRef<number>(row.startedAt)
  const prevTextRef = useRef<string>(row.text)
  if (prevTextRef.current !== row.text) {
    prevTextRef.current = row.text
    lastUpdateRef.current = Date.now()
  }

  // Drive a re-render every ~150ms while streaming so the shimmer palette
  // advances and the elapsed-on-idle counter updates.
  const tick = useShimmer({ active: streaming })

  const now = streaming ? Date.now() : (row.endedAt ?? Date.now())
  const elapsedMs = now - row.startedAt
  const elapsed = formatDuration(elapsedMs)
  const idleMs = streaming ? now - lastUpdateRef.current : 0
  const showIdleElapsed = streaming && idleMs > IDLE_REVEAL_MS

  if (!row.expanded) {
    const verbColor = streaming ? pickShimmer(SHIMMER_PALETTE, tick) : THEME.brand
    const verbText = streaming ? `${verb}…` : `${verb} for ${elapsed}`
    return (
      <Box paddingX={1} flexDirection="row">
        <Text color={THEME.brand}>* </Text>
        <Text color={verbColor} dimColor italic>
          {verbText}
        </Text>
        {streaming && showIdleElapsed ? (
          <Text color={THEME.brand} dimColor italic>
            {` ${elapsed}`}
          </Text>
        ) : null}
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
