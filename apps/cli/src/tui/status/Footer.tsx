import { basename } from 'node:path'
import React from 'react'
import { Box, Text } from 'ink'
import type { EffortTier, PermissionMode, SessionTaskSummary, TerseMode, UsageTotals } from '@orchentra/cli-core'
import { formatUsd, pricingForModel } from '@orchentra/cli-core'
import { CLI_VERSION } from '../../version'
import { DEFAULT_STATUSLINE_CONFIG, type StatuslineConfig, type StatuslineFieldId } from '../../statusline'
import { humanizeModelId } from '../../model-catalog'
import { THEME } from '../theme'
import { FIGURES } from '../figures'
import type { TurnStatus } from '../types'
import { ShimmerText } from '../components/ShimmerText'

export interface FooterContextStats {
  readonly estimatedTokens?: number
  readonly contextWindowTokens?: number
  readonly compactThresholdRatio?: number
}

export interface FooterProps {
  readonly model: string
  readonly mode: PermissionMode
  readonly terseMode: TerseMode
  readonly effort?: EffortTier
  readonly cwd: string
  readonly branch?: string
  readonly sessionId?: string
  readonly turn: TurnStatus
  readonly spinnerFrame: number
  readonly exitHintActive: boolean
  /** Which exit key armed the hint, so the message names the right key. */
  readonly exitHintKey?: 'ctrl+c' | 'ctrl+d'
  readonly contextStats?: FooterContextStats
  readonly tasks?: readonly SessionTaskSummary[]
  readonly statusline?: StatuslineConfig
}

export function Footer(props: FooterProps): React.ReactElement {
  // While a turn is running, the only thing the footer needs to say is what
  // the agent is doing — the rest is noise. When idle, show a single compact
  // status line: model, cwd, branch, context, mode, terse, and cost.
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

  const statusline = props.statusline ?? DEFAULT_STATUSLINE_CONFIG
  const segments = statusline.fields
    .map((field) => renderStatuslineField(field, props))
    .filter((segment): segment is string => !!segment)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color={statusline.useThemeColors ? THEME.brand : THEME.muted} bold>
          {THEME.dot}
        </Text>
        <Text dimColor wrap="truncate-end">{`  ${segments.join(` ${THEME.separator} `)}`}</Text>
      </Box>
      {props.exitHintActive ? (
        <Text color={THEME.warn}>{`press ${props.exitHintKey === 'ctrl+d' ? 'Ctrl+D' : 'Ctrl+C'} again to exit`}</Text>
      ) : null}
    </Box>
  )
}

function renderStatuslineField(field: StatuslineFieldId, props: FooterProps): string | null {
  const usage = props.turn.tokens
  const context = renderContext(props.contextStats)
  const totalTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
  const modelLabel = humanizeModelId(props.model)
  switch (field) {
    case 'model-with-reasoning':
      return props.effort ? `${modelLabel} · ${props.effort}` : modelLabel
    case 'current-dir':
    case 'project-name':
      return formatCwd(props.cwd)
    case 'permissions':
    case 'approval-mode':
      return props.mode === 'workspace-write' ? null : formatMode(props.mode)
    case 'terse-mode':
      return props.terseMode === 'off' ? null : `terse:${props.terseMode}`
    case 'active-tasks':
      return renderActiveTasks(props.tasks)
    case 'session-cost':
      return renderCost(usage, props.model)
    case 'model':
      return modelLabel
    case 'reasoning':
      return props.effort ? `effort:${props.effort}` : null
    case 'git-branch':
      return props.branch ? `git:(${props.branch})` : null
    case 'run-state':
      return 'ready'
    case 'context-used':
      return context?.text ?? null
    case 'context-remaining':
      return renderContextRemaining(props.contextStats)
    case 'codex-version':
      return `orchentra ${CLI_VERSION}`
    case 'context-window-size':
      return props.contextStats?.contextWindowTokens
        ? `${formatNumber(props.contextStats.contextWindowTokens)} ctx`
        : null
    case 'used-tokens':
      return totalTokens > 0 ? `${formatNumber(totalTokens)} tokens` : null
    case 'total-input-tokens':
      return usage.inputTokens > 0 ? `${formatNumber(usage.inputTokens)} in` : null
    case 'total-output-tokens':
      return usage.outputTokens > 0 ? `${formatNumber(usage.outputTokens)} out` : null
    case 'thread-id':
      return props.sessionId ? `session:${props.sessionId.slice(0, 8)}` : null
    case 'five-hour-limit':
    case 'pull-request-number':
    case 'branch-changes':
    case 'weekly-limit':
    case 'fast-mode':
    case 'raw-output':
    case 'thread-title':
    case 'workspace-headline':
    case 'task-progress':
      return null
  }
}

function renderActiveTasks(tasks: readonly SessionTaskSummary[] | undefined): string | null {
  const activeTasks = tasks?.filter((t) => t.status === 'running' || t.status === 'pending').length ?? 0
  if (activeTasks === 0) return null
  return `${FIGURES.gear} ${activeTasks} ${activeTasks === 1 ? 'task' : 'tasks'}`
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

interface StatusInnerProps {
  readonly turn: TurnStatus
  readonly spinnerFrame: number
}

function StatusGlyph({ turn }: StatusInnerProps): React.ReactElement {
  if (turn.state === 'idle') {
    return (
      <Text color={THEME.brand} bold>
        {THEME.dot}
      </Text>
    )
  }
  const color = turn.state === 'cancelling' ? THEME.warn : THEME.brand
  return (
    <Text color={color} bold>
      *
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
  const upSegment = turn.tokens.inputTokens > 0 ? `  ↑${turn.tokens.inputTokens}` : ''
  const downSegment = turn.tokens.outputTokens > 0 ? `  ↓${turn.tokens.outputTokens}` : ''
  return (
    <Text>
      <ShimmerText text={label} frame={spinnerFrame} bold />
      <Text dimColor>{`  ${elapsed}${upSegment}${downSegment}  (esc to interrupt)`}</Text>
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

function renderContext(stats: FooterContextStats | undefined): { text: string; color: string } | null {
  const window = stats?.contextWindowTokens
  const estimated = stats?.estimatedTokens
  if (!window || window <= 0 || estimated === undefined || estimated < 0) return null

  const used = Math.min(999, Math.max(0, Math.round((estimated / window) * 100)))
  const compactAt = Math.round((stats?.compactThresholdRatio ?? 0.8) * 100)
  const color = used >= 90 ? THEME.danger : used >= compactAt ? THEME.warn : THEME.brandDim
  return { text: `ctx ${used}%`, color }
}

function renderContextRemaining(stats: FooterContextStats | undefined): string | null {
  const window = stats?.contextWindowTokens
  const estimated = stats?.estimatedTokens
  if (!window || window <= 0 || estimated === undefined || estimated < 0) return null
  const remaining = Math.max(0, Math.round(((window - estimated) / window) * 100))
  return `ctx ${remaining}% left`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)))
}

function formatCwd(cwd: string): string {
  const trimmed = cwd.replace(/[/\\]+$/, '')
  const leaf = basename(trimmed)
  return leaf || cwd
}

function formatMode(mode: PermissionMode): string {
  switch (mode) {
    case 'allow':
      return 'allow ⚠ skip permissions'
    case 'danger-full-access':
      return 'danger-full-access ⚠'
    default:
      return mode
  }
}
