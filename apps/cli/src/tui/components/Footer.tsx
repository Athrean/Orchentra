import React from 'react'
import { homedir } from 'node:os'
import { Box, Text } from 'ink'
import type { PermissionMode, UsageTotals } from '@orchentra/cli-core'
import { formatUsd, pricingForModel } from '@orchentra/cli-core'
import { THEME, modeAccent } from '../theme'
import type { TurnStatus } from '../types'

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
  const status = renderStatus(props.turn, props.spinnerFrame)
  const cost = renderCost(props.turn.tokens, props.model)
  const left = [prettyCwd(props.cwd), props.branch].filter(Boolean).join(`  ${THEME.bullet}  `)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color={status.color} bold>
          {status.glyph}
        </Text>
        <Text dimColor>{`  ${status.label}`}</Text>
        <Text>{'  '}</Text>
        <Text dimColor>{left}</Text>
        <Box flexGrow={1} />
        <Text dimColor>{props.model}</Text>
        <Text color={modeAccent(props.mode)}>{`  ${THEME.bullet}  ${formatMode(props.mode)}`}</Text>
        {cost ? <Text dimColor>{`  ${THEME.bullet}  ${cost}`}</Text> : null}
      </Box>
      {props.exitHintActive ? <Text color={THEME.warn}>press Ctrl+C again to exit</Text> : null}
    </Box>
  )
}

interface StatusRender {
  readonly glyph: string
  readonly color: string
  readonly label: string
}

function renderStatus(turn: TurnStatus, spinnerFrame: number): StatusRender {
  if (turn.state === 'idle') {
    return { glyph: THEME.dot, color: THEME.brand, label: 'ready' }
  }
  const elapsed = formatElapsed(turn.elapsedMs)
  const frame = THEME.spinner[spinnerFrame % THEME.spinner.length]
  if (turn.state === 'cancelling') {
    return { glyph: frame, color: THEME.warn, label: `cancelling… ${elapsed}` }
  }
  return { glyph: frame, color: THEME.brand, label: `thinking… ${elapsed}  (esc to interrupt)` }
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

function prettyCwd(cwd: string): string {
  const home = homedir()
  if (home && cwd === home) return '~'
  if (home && cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`
  return cwd
}
