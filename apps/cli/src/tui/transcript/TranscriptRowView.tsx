import React from 'react'
import { Box, Text } from 'ink'
import { formatUsd, pricingForModel, type UsageTotals } from '@orchentra/cli-core'
import { BRAND_GREEN, type TranscriptRow } from '../types'
import { THEME } from '../theme'
import { CardSections } from '../components/CardSections'
import { CollapsibleBlock } from '../components/CollapsibleBlock'
import { DiffView, looksLikeDiff } from '../components/DiffView'
import { MarkdownView } from '../components/MarkdownView'
import { ReasoningBlock } from '../components/ReasoningBlock'
import { previewToolResult } from '../components/tool-preview'

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
            {'● '}
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
            {'⏺ '}
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

export function splitPreviewLines(text: string, maxLines: number): string[] {
  const all = text.split('\n').map((l) => l.replace(/\s+$/, ''))
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
