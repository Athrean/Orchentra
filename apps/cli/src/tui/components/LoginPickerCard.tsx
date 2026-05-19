import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { THEME } from '../theme'
import { AnthropicLoginCard } from './AnthropicLoginCard'
import { initialLoginState, loginReducer, type LoginState } from '../../login/state-machine'

export interface LoginPickerResult {
  readonly ok: boolean
  readonly message: string
}

export interface LoginPickerCardProps {
  readonly onComplete: (result: LoginPickerResult) => void
}

interface TopRow {
  readonly label: string
  readonly hint: string
}

const TOP_ROWS: readonly TopRow[] = [
  { label: 'Pro/Max plan', hint: 'Sign in with your Claude subscription · OAuth' },
  { label: 'API key', hint: 'Anthropic Console, OpenAI, OpenRouter, Gemini, xAI, DashScope' },
  { label: '3rd-party platform', hint: 'Amazon Bedrock, Microsoft Foundry, Vertex AI, Azure' },
]

export function LoginPickerCard(props: LoginPickerCardProps): React.ReactElement {
  const [state, setState] = useState<LoginState>(initialLoginState())

  useInput(
    (_input, key) => {
      if (state.kind === 'oauth' || state.kind === 'done' || state.kind === 'closed') {
        // Child cards / terminal states own their own input.
        return
      }
      if (key.escape || (key.ctrl && _input === 'c')) {
        const next = loginReducer(state, { type: 'cancel' })
        setState(next)
        if (next.kind === 'closed') props.onComplete({ ok: false, message: 'cancelled' })
        return
      }
      if (key.upArrow) {
        setState(loginReducer(state, { type: 'cursor-up' }))
        return
      }
      if (key.downArrow) {
        setState(loginReducer(state, { type: 'cursor-down' }))
        return
      }
      if (key.return) {
        const next = loginReducer(state, { type: 'select' })
        setState(next)
        if (next.kind === 'done') {
          props.onComplete({ ok: next.ok, message: next.message })
        }
        return
      }
    },
    { isActive: true },
  )

  if (state.kind === 'oauth' && state.provider === 'anthropic') {
    return (
      <AnthropicLoginCard
        onComplete={(result) => {
          const next = result.ok
            ? loginReducer(state, { type: 'success', message: result.message })
            : loginReducer(state, { type: 'fail', error: result.message })
          setState(next)
          if (next.kind === 'done') props.onComplete({ ok: next.ok, message: next.message })
        }}
      />
    )
  }

  // Top tier is the only renderable picker state in Slice 1; api-key + 3rd-party
  // transition straight to `done` and the parent dismisses the overlay.
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Login
      </Text>
      <Text dimColor>Sign in to Orchentra and the model provider that powers it.</Text>
      <Box height={1} />
      {renderTop(state)}
      <Box height={1} />
      <Text dimColor>↑/↓ to move · Enter to select · Esc to cancel</Text>
    </Box>
  )
}

function renderTop(state: LoginState): React.ReactElement | null {
  if (state.kind !== 'top') return null
  const labelW = TOP_ROWS.reduce((m, r) => Math.max(m, r.label.length), 0)
  return (
    <Box flexDirection="column">
      {TOP_ROWS.map((row, i) => {
        const active = i === state.cursor
        return (
          <Box key={row.label} flexDirection="row">
            <Text color={active ? THEME.brand : undefined}>{active ? '❯ ' : '  '}</Text>
            <Text color={active ? THEME.brand : undefined} bold={active}>
              {row.label.padEnd(labelW, ' ')}
            </Text>
            <Text dimColor>{`  ${row.hint}`}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
