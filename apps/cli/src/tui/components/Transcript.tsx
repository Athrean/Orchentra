import React from 'react'
import { Box, Static, Text } from 'ink'
import { formatUsd, pricingForModel, type UsageTotals } from '@orchentra/cli-core'
import { BRAND_GREEN, type TranscriptRow } from '../types'
import { THEME } from '../theme'
import { CardSections } from './CardSections'
import { CollapsibleBlock } from './CollapsibleBlock'
import { DiffView, looksLikeDiff } from './DiffView'
import { ReasoningBlock } from './ReasoningBlock'
import { MarkdownView } from './MarkdownView'
import { previewToolResult } from './tool-preview'
import { WelcomeBanner, type BannerOptions } from '../../render/banner'
import { useNow } from '../use-now'

export const TOOL_ROW_DIM_AFTER_MS = 5_000

export interface TranscriptProps {
  readonly rows: readonly TranscriptRow[]
  readonly generation: number
  /** The currently-streaming row, if any. Pulled out of `rows` because Static
   * commits each row exactly once — we render the live one separately until
   * it stops streaming. */
  readonly streamingRowId: string | null
  /**
   * Welcome banner props. Rendered as the first static-committed item so it
   * lands above the transcript in scrollback. Ink commits a Static item
   * exactly once, so the banner does not flicker on subsequent renders.
   */
  readonly banner?: BannerOptions
}

type StaticItem =
  | { readonly kind: 'banner'; readonly props: BannerOptions }
  | { readonly kind: 'row'; readonly row: TranscriptRow }

/**
 * Append-only transcript. Completed rows go through `<Static>` (Ink prints
 * them once and then the terminal owns the scrollback). The currently
 * streaming row, if any, renders as a normal child below so it can update.
 */
export function Transcript(props: TranscriptProps): React.ReactElement {
  // useNow drives time-based visual transitions (e.g. tool-row dimming
  // 5s after completion). Static rows are committed once, so we keep
  // recently-completed tool_call rows in the live region until they age
  // past the dim threshold; after that they commit to Static with the
  // dim flag baked in and stop re-rendering.
  const now = useNow()
  const items: StaticItem[] = []
  if (props.banner) items.push({ kind: 'banner', props: props.banner })
  const live: TranscriptRow[] = []
  for (const row of props.rows) {
    if (row.id === props.streamingRowId) {
      live.push(row)
    } else if (row.kind === 'tool_call' && row.streaming) {
      live.push(row)
    } else if (row.kind === 'tool_call' && !isOldTool(row, now)) {
      // Recently finalized — keep in live so its color can flip to dim
      // when it ages past the threshold on the next clock tick.
      live.push(row)
    } else {
      items.push({ kind: 'row', row })
    }
  }
  return (
    <>
      <Static key={props.generation} items={items}>
        {(item) =>
          item.kind === 'banner' ? (
            <Box key={`__banner__:${props.generation}`} flexDirection="column">
              <WelcomeBanner {...item.props} />
              <Box height={1} />
            </Box>
          ) : (
            <Box key={`${props.generation}:${item.row.id}`} flexDirection="column" marginBottom={1}>
              <TranscriptRowView row={item.row} dim={isOldTool(item.row, now)} />
            </Box>
          )
        }
      </Static>
      {live.map((row) => (
        <Box key={row.id} flexDirection="column" marginBottom={1}>
          <TranscriptRowView row={row} streaming dim={isOldTool(row, now)} />
        </Box>
      ))}
    </>
  )
}

function isOldTool(row: TranscriptRow, now: number): boolean {
  if (row.kind !== 'tool_call') return false
  if (row.streaming) return false
  if (!row.completedAt) return false
  return now - row.completedAt > TOOL_ROW_DIM_AFTER_MS
}

interface RowProps {
  readonly row: TranscriptRow
  readonly streaming?: boolean
  /**
   * When true, the row renders in `mutedText` color regardless of its
   * normal palette. Used for completed tool-call rows older than
   * `TOOL_ROW_DIM_AFTER_MS` so the user's eye is drawn to the most
   * recent active call.
   */
  readonly dim?: boolean
}

export function TranscriptRowView(props: RowProps): React.ReactElement {
  const { row, dim } = props
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
        <Box paddingX={1} flexDirection="row">
          <Text color={THEME.brand} bold>
            ●{' '}
          </Text>
          <Box flexDirection="column" flexGrow={1}>
            <MarkdownView text={row.text} streaming={props.streaming} />
          </Box>
        </Box>
      )
    case 'tool_call':
      return (
        <Box paddingX={1} flexDirection="row">
          <Text color={dim ? THEME.muted : THEME.brand} bold={!dim}>
            ⏺{' '}
          </Text>
          <Text color={dim ? THEME.muted : undefined} bold={!dim}>
            {row.name}
          </Text>
          <Text dimColor>{`(${summarizeToolArgs(row.input)}${row.streaming ? '…' : ''})`}</Text>
        </Box>
      )
    case 'tool_result': {
      if (!row.isError && looksLikeDiff(row.preview)) {
        return (
          <Box paddingX={1} flexDirection="column">
            <Box flexDirection="row">
              <Text color={THEME.muted}>{'  ⎿  '}</Text>
              <Text dimColor>diff</Text>
            </Box>
            <Box marginLeft={5}>
              <DiffView text={row.preview} maxLines={row.expanded ? 1000 : 40} />
            </Box>
          </Box>
        )
      }
      // Compute the collapsed view first so we always know how many lines
      // would be hidden — that count drives both the summary line (collapsed)
      // and whether to render the collapse hint (expanded).
      const collapsedView = previewToolResult(row.preview, { maxLines: 3, maxChars: 240 })
      const result = row.expanded
        ? previewToolResult(row.preview, { maxLines: 3, maxChars: 240, full: true })
        : collapsedView
      const hiddenWhenCollapsed = collapsedView.truncated ? collapsedView.hiddenLines : 0
      if (row.isError) {
        return (
          <Box paddingX={1} flexDirection="column">
            {result.lines.map((line, i) => (
              <Box key={i} flexDirection="row">
                <Text color={THEME.muted}>{i === 0 ? '  ⎿  ' : '     '}</Text>
                <Text color={THEME.warn}>{line}</Text>
              </Box>
            ))}
            {result.truncated ? (
              <Box flexDirection="row">
                <Text color={THEME.muted}>{'     '}</Text>
                <Text
                  dimColor
                >{`… +${result.hiddenLines} line${result.hiddenLines === 1 ? '' : 's'} (ctrl+o to expand)`}</Text>
              </Box>
            ) : null}
          </Box>
        )
      }
      return (
        <Box paddingX={1}>
          <CollapsibleBlock
            lines={result.lines}
            expanded={row.expanded}
            collapsedTo={result.lines.length}
            summaryHidden={hiddenWhenCollapsed}
          />
        </Box>
      )
    }
    case 'system':
      return (
        <Box paddingX={1}>
          <Text color={row.tone === 'warn' ? THEME.warn : THEME.accent} dimColor>
            {row.text}
          </Text>
        </Box>
      )
    case 'error':
      return (
        <Box paddingX={1}>
          <Text color={THEME.warn}>Error: {row.message}</Text>
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
    case 'reasoning':
      return <ReasoningBlock row={row} />
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
          {row.title ? <Box height={1} /> : null}
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
