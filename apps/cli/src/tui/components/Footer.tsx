import React from 'react'
import { homedir } from 'node:os'
import { Box, Text } from 'ink'
import type { PermissionMode, UsageTotals } from '@orchentra/cli-core'
import { formatUsd, pricingForModel } from '@orchentra/cli-core'
import { BRAND_GREEN, type TurnStatus } from '../types'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

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

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color={BRAND_GREEN} bold>
          {status.label}
        </Text>
        {status.detail ? (
          <Text dimColor>
            {'  '}
            {status.detail}
          </Text>
        ) : null}
      </Box>
      <Box>
        <Text dimColor>
          {prettyCwd(props.cwd)}
          {props.branch ? `  ·  ${props.branch}` : ''}
        </Text>
        <Box flexGrow={1} />
        <Text dimColor>{props.model}</Text>
        <Text color={modeColor(props.mode)}>
          {'  ·  '}
          {formatMode(props.mode)}
        </Text>
        {cost ? (
          <Text dimColor>
            {'  ·  '}
            {cost}
          </Text>
        ) : null}
      </Box>
      {props.exitHintActive ? (
        <Box>
          <Text color="yellow">press Ctrl+C again to exit</Text>
        </Box>
      ) : null}
    </Box>
  )
}

interface StatusRender {
  readonly label: string
  readonly detail: string
}

function renderStatus(turn: TurnStatus, spinnerFrame: number): StatusRender {
  if (turn.state === 'idle') {
    return { label: '●', detail: 'ready' }
  }
  const elapsed = formatElapsed(turn.elapsedMs)
  const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]
  if (turn.state === 'cancelling') {
    return { label: frame, detail: `cancelling… ${elapsed}` }
  }
  return { label: frame, detail: `thinking… ${elapsed}  (esc once to interrupt)` }
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
  return parts.join('  ·  ')
}

function modeColor(mode: PermissionMode): string {
  switch (mode) {
    case 'read-only':
      return 'cyan'
    case 'workspace-write':
      return BRAND_GREEN
    case 'allow':
      return 'yellow'
    case 'danger-full-access':
      return 'red'
    case 'prompt':
      return 'white'
  }
}

function formatMode(mode: PermissionMode): string {
  switch (mode) {
    case 'read-only':
      return 'read-only'
    case 'workspace-write':
      return 'workspace-write'
    case 'allow':
      return 'allow ⚠'
    case 'danger-full-access':
      return 'danger ⚠'
    case 'prompt':
      return 'prompt'
  }
}

function prettyCwd(cwd: string): string {
  const home = homedir()
  if (home && cwd === home) return '~'
  if (home && cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`
  return cwd
}
