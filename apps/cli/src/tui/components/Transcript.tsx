import React from 'react'
import { Box, Static, Text } from 'ink'
import { formatUsd, pricingForModel, type UsageTotals } from '@orchentra/cli-core'
import { BRAND_GREEN, type TranscriptRow } from '../types'

export interface TranscriptProps {
  readonly rows: readonly TranscriptRow[]
  /** The currently-streaming row, if any. Pulled out of `rows` because Static
   * commits each row exactly once — we render the live one separately until
   * it stops streaming. */
  readonly streamingRowId: string | null
}

/**
 * Append-only transcript. Completed rows go through `<Static>` (Ink prints
 * them once and then the terminal owns the scrollback). The currently
 * streaming row, if any, renders as a normal child below so it can update.
 */
export function Transcript(props: TranscriptProps): React.ReactElement {
  const completed: TranscriptRow[] = []
  let streaming: TranscriptRow | null = null
  for (const row of props.rows) {
    if (row.id === props.streamingRowId) {
      streaming = row
    } else {
      completed.push(row)
    }
  }
  return (
    <>
      <Static items={completed}>{(row) => <TranscriptRowView key={row.id} row={row} />}</Static>
      {streaming ? <TranscriptRowView row={streaming} /> : null}
    </>
  )
}

interface RowProps {
  readonly row: TranscriptRow
}

export function TranscriptRowView(props: RowProps): React.ReactElement {
  const { row } = props
  switch (row.kind) {
    case 'user':
      return (
        <Box paddingX={1} flexDirection="row">
          <Text color={BRAND_GREEN} bold>
            {'> '}
          </Text>
          <Text>{row.text}</Text>
        </Box>
      )
    case 'assistant':
      return (
        <Box paddingX={1} flexDirection="column">
          <Text>{row.text}</Text>
        </Box>
      )
    case 'tool_call':
      return (
        <Box paddingX={1} flexDirection="row">
          <Text color="cyan">{'  → '}</Text>
          <Text color="cyan">{row.name}</Text>
          <Text dimColor> {truncate(row.input, 120)}</Text>
        </Box>
      )
    case 'tool_result':
      return (
        <Box paddingX={1} flexDirection="row">
          <Text color={row.isError ? 'yellow' : undefined} dimColor>
            {'  ← '}
            {truncate(row.preview, 200)}
          </Text>
        </Box>
      )
    case 'system':
      return (
        <Box paddingX={1}>
          <Text color={row.tone === 'warn' ? 'yellow' : 'cyan'} dimColor>
            {row.text}
          </Text>
        </Box>
      )
    case 'error':
      return (
        <Box paddingX={1}>
          <Text color="yellow">Error: {row.message}</Text>
        </Box>
      )
    case 'compacted':
      return (
        <Box paddingX={1}>
          <Text dimColor>
            Context compacted: {row.dropped} messages dropped, ~{row.saved} tokens saved
          </Text>
        </Box>
      )
    case 'done':
      return (
        <Box paddingX={1} flexDirection="row">
          <Text color={BRAND_GREEN} bold>
            ✓
          </Text>
          <Text color={BRAND_GREEN}> done</Text>
          <Text dimColor>
            {' '}
            ({row.steps} step{row.steps === 1 ? '' : 's'}) · {row.usage.inputTokens}↓ {row.usage.outputTokens}↑
            {renderCost(row.usage, row.model)}
          </Text>
        </Box>
      )
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

function renderCost(usage: UsageTotals, model: string): string {
  const pricing = pricingForModel(model)
  if (!pricing) return ''
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputCostPerMillion
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputCostPerMillion
  return `  ·  ${formatUsd(inputCost + outputCost)}`
}
