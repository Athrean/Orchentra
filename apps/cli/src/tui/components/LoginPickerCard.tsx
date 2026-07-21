import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { saveCredentialAsync, tryLoadKeytar, type ProviderKey } from '@orchentra/cli-api'
import { THEME } from '../theme'
import { ApiKeyPickerCard } from './ApiKeyPickerCard'
import { ApiKeyInputCard } from './ApiKeyInputCard'
import { ThirdPartyPickerCard } from './ThirdPartyPickerCard'
import { spawn } from 'node:child_process'
import {
  apiKeyProviderToCredentialKey,
  initialLoginState,
  loginReducer,
  THIRD_PARTY_PROVIDERS,
  type ApiKeyProvider,
  type LoginState,
} from '../../login/state-machine'

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
  { label: 'API key', hint: 'Anthropic Console, OpenAI, OpenRouter, Gemini, xAI, DashScope' },
  { label: '3rd-party platform', hint: 'Amazon Bedrock, Microsoft Foundry, Vertex AI, Azure' },
]

export function LoginPickerCard(props: LoginPickerCardProps): React.ReactElement {
  const [state, setState] = useState<LoginState>(() => initialLoginState())
  const [saving, setSaving] = useState(false)

  function dispatch(event: Parameters<typeof loginReducer>[1]): LoginState {
    const next = loginReducer(state, event)
    setState(next)
    if (next.kind === 'closed') props.onComplete({ ok: false, message: 'cancelled' })
    if (next.kind === 'done') props.onComplete({ ok: next.ok, message: next.message })
    return next
  }

  async function saveApiKey(provider: ApiKeyProvider, key: string): Promise<void> {
    setSaving(true)
    try {
      const shim = await tryLoadKeytar()
      const credKey = apiKeyProviderToCredentialKey(provider) as ProviderKey
      await saveCredentialAsync(credKey, { apiKey: key }, undefined, shim)
      setSaving(false)
      dispatch({ type: 'success', message: `saved ${credKey} API key` })
    } catch (err) {
      setSaving(false)
      dispatch({ type: 'fail', error: err instanceof Error ? err.message : String(err) })
    }
  }

  useInput(
    (input, key) => {
      if (state.kind === 'done' || state.kind === 'closed') {
        // Terminal states own their own input.
        return
      }
      if (saving) return
      if (key.escape || (key.ctrl && input === 'c')) {
        const event = state.kind === 'top' ? { type: 'cancel' as const } : { type: 'back' as const }
        dispatch(event)
        return
      }
      if (state.kind === 'thirdPartyPicker') {
        if (key.upArrow) {
          dispatch({ type: 'cursor-up' })
          return
        }
        if (key.downArrow) {
          dispatch({ type: 'cursor-down' })
          return
        }
        if (key.return) {
          const row = THIRD_PARTY_PROVIDERS[state.cursor]
          if (row) openInBrowser(row.docsUrl)
          dispatch({ type: 'select' })
          return
        }
        return
      }
      if (state.kind === 'apiKeyInput') {
        if (key.return) {
          if (state.buffer.trim().length > 0) void saveApiKey(state.provider, state.buffer.trim())
          return
        }
        if (key.backspace || key.delete) {
          dispatch({ type: 'set-buffer', buffer: state.buffer.slice(0, -1) })
          return
        }
        if (input && !key.ctrl && !key.meta) {
          dispatch({ type: 'set-buffer', buffer: state.buffer + input })
          return
        }
        return
      }
      if (key.upArrow) {
        dispatch({ type: 'cursor-up' })
        return
      }
      if (key.downArrow) {
        dispatch({ type: 'cursor-down' })
        return
      }
      if (key.return) {
        dispatch({ type: 'select' })
        return
      }
    },
    { isActive: true },
  )

  if (state.kind === 'apiKeyPicker') {
    return <ApiKeyPickerCard cursor={state.cursor} signedIn={new Set()} />
  }

  if (state.kind === 'apiKeyInput') {
    return <ApiKeyInputCard provider={state.provider} buffer={state.buffer} error={state.error} saving={saving} />
  }

  if (state.kind === 'thirdPartyPicker') {
    return <ThirdPartyPickerCard cursor={state.cursor} />
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

function openInBrowser(url: string): void {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  try {
    const child = spawn(cmd, platform === 'win32' ? ['', url] : [url], {
      stdio: 'ignore',
      detached: true,
      shell: platform === 'win32',
    })
    child.on('error', () => {
      /* docs URL still surfaces in the transcript note so the user can copy */
    })
    child.unref()
  } catch {
    /* ignore */
  }
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
