import React from 'react'
import { Box, Text } from 'ink'
import type { PermissionMode, UsageTotals } from '@orchentra/cli-core'
import { formatUsd, pricingForModel } from '@orchentra/cli-core'
import { THEME, modeAccent } from '../theme'
import type { TurnStatus } from '../types'
import { ShimmerText } from './ShimmerText'

export interface FooterProps {
  readonly model: string
  readonly mode: PermissionMode
  readonly cwd: string
  readonly branch?: string
  readonly turn: TurnStatus
  readonly spinnerFrame: number
  readonly exitHintActive: boolean
}

export function Footer(props: FooterProps): React.ReactElement {
  // While a turn is running, the only thing the footer needs to say is what
  // the agent is doing — the rest is noise. When idle, show a single
  // compact line (model | branch | cost-if-any). The shortcut strip lives
  // behind '?' so it doesn't compete for visual weight every frame.
  if (props.turn.state !== 'idle') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box>
          <StatusGlyph turn={props.turn} spinnerFrame={props.spinnerFrame} />
          <Text>{'  '}</Text>
          <StatusLabel turn={props.turn} spinnerFrame={props.spinnerFrame} />
        </Box>
      </Box>
    )
  }

  const cost = renderCost(props.turn.tokens, props.model)
  const branchSegment = props.branch ? ` ${THEME.separator} git:(${props.branch})` : ''
  const costSegment = cost ? ` ${THEME.separator} ${cost}` : ''
  const modeSegment = props.mode === 'workspace-write' ? '' : ` ${THEME.separator} ${formatMode(props.mode)}`

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text dimColor>{props.model}</Text>
        <Text dimColor>{branchSegment}</Text>
        {modeSegment ? <Text color={modeAccent(props.mode)}>{modeSegment}</Text> : null}
        {costSegment ? <Text dimColor>{costSegment}</Text> : null}
      </Box>
      {props.exitHintActive ? <Text color={THEME.warn}>press Ctrl+C again to exit</Text> : null}
    </Box>
  )
}

interface StatusInnerProps {
  readonly turn: TurnStatus
  readonly spinnerFrame: number
}

function StatusGlyph({ turn, spinnerFrame }: StatusInnerProps): React.ReactElement {
  if (turn.state === 'idle') {
    return (
      <Text color={THEME.brand} bold>
        {THEME.dot}
      </Text>
    )
  }
  const frame = THEME.spinner[spinnerFrame % THEME.spinner.length]
  const color = turn.state === 'cancelling' ? THEME.warn : THEME.brand
  return (
    <Text color={color} bold>
      {frame}
    </Text>
  )
}

function StatusLabel({ turn, spinnerFrame }: StatusInnerProps): React.ReactElement {
  if (turn.state === 'idle') {
    return <Text dimColor>ready</Text>
  }
  const elapsed = formatElapsed(turn.elapsedMs)
  if (turn.state === 'cancelling') {
    return (
      <Text>
        <ShimmerText text="cancelling…" frame={spinnerFrame} />
        <Text dimColor>{`  ${elapsed}`}</Text>
      </Text>
    )
  }
  const label = `${turn.verb ?? 'Thinking'}…`
  const tokenSegment = turn.tokens.outputTokens > 0 ? `  ↓${turn.tokens.outputTokens}` : ''
  return (
    <Text>
      <ShimmerText text={label} frame={spinnerFrame} bold />
      <Text dimColor>{`  ${elapsed}${tokenSegment}  (esc to interrupt)`}</Text>
    </Text>
  )
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m${s % 60}s`
}

function renderCost(usage: UsageTotals, model: string): string | null {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return null
  const parts = [`${usage.inputTokens}↓ ${usage.outputTokens}↑`]
  const pricing = pricingForModel(model)
  if (pricing) {
    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputCostPerMillion
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputCostPerMillion
    parts.push(formatUsd(inputCost + outputCost))
  }
  return parts.join(`  ${THEME.bullet}  `)
}

function formatMode(mode: PermissionMode): string {
  switch (mode) {
    case 'allow':
      return 'allow ⚠'
    case 'danger-full-access':
      return 'danger ⚠'
    default:
      return mode
  }
}
