import React from 'react'
import { Box, Static, Text } from 'ink'
import { formatUsd, pricingForModel, type UsageTotals } from '@orchentra/cli-core'
import { BRAND_GREEN, type TranscriptRow } from '../types'
import { THEME } from '../theme'
import { CardSections } from './CardSections'

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
          <Text color={THEME.brand} bold>
            ⏺{' '}
          </Text>
          <Text bold>{row.name}</Text>
          <Text dimColor>{`(${summarizeToolArgs(row.input)})`}</Text>
        </Box>
      )
    case 'tool_result': {
      const lines = splitPreviewLines(row.preview, 6)
      const errColor = row.isError ? 'yellow' : undefined
      return (
        <Box paddingX={1} flexDirection="column">
          {lines.map((line, i) => (
            <Box key={i} flexDirection="row">
              <Text color={THEME.muted}>{i === 0 ? '  ⎿  ' : '     '}</Text>
              <Text color={errColor} dimColor={!row.isError}>
                {line}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }
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
    case 'stream':
      return (
        <Box paddingX={1} flexDirection="column">
          {row.label ? (
            <Text color={THEME.brand} bold>
              {row.label}
            </Text>
          ) : null}
          <Text>{row.text}</Text>
        </Box>
      )
    case 'card':
      return (
        <Box paddingX={1} flexDirection="column">
          {row.title ? (
            <Text bold color={THEME.brand}>
              {row.title}
              {row.subtitle ? <Text dimColor>{`  ${row.subtitle}`}</Text> : null}
            </Text>
          ) : null}
          <CardSections sections={row.sections} />
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

// Tool calls store `input` as either a JSON-encoded args object or a raw
// string. For display, condense JSON args to a comma-joined `k=v` line so
// the call header reads like a function signature.
export function summarizeToolArgs(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>
      const pairs: string[] = []
      for (const [k, v] of Object.entries(obj)) {
        const sv = typeof v === 'string' ? v : JSON.stringify(v)
        const short = sv.length > 40 ? sv.slice(0, 39) + '…' : sv
        pairs.push(`${k}=${short}`)
      }
      const joined = pairs.join(', ')
      return joined.length > 100 ? joined.slice(0, 99) + '…' : joined
    } catch {
      // fall through to raw truncation
    }
  }
  return truncate(trimmed, 100)
}

// Show the first few non-empty lines of a tool result; longer output gets
// elided with a ` …(N more)` tail so the transcript stays readable.
export function splitPreviewLines(text: string, maxLines: number): string[] {
  const all = text.split('\n').map((l) => l.replace(/\s+$/, ''))
  // Drop trailing blanks but keep internal ones.
  while (all.length > 0 && all[all.length - 1] === '') all.pop()
  if (all.length <= maxLines) return all.length === 0 ? [''] : all
  const head = all.slice(0, maxLines)
  head.push(`…(${all.length - maxLines} more line${all.length - maxLines === 1 ? '' : 's'})`)
  return head
}

function renderCost(usage: UsageTotals, model: string): string {
  const pricing = pricingForModel(model)
  if (!pricing) return ''
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputCostPerMillion
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputCostPerMillion
  return `  ·  ${formatUsd(inputCost + outputCost)}`
}
