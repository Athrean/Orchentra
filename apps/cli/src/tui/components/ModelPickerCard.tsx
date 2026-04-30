import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { THEME } from '../theme'

export interface ModelOption {
  readonly id: string
  readonly label: string
  readonly provider: string
  readonly hint?: string
}

export interface ModelPickerCardProps {
  readonly current: string
  readonly onPick: (modelId: string) => void
  readonly onCancel: () => void
}

// Curated list of frontier models, OAuth-eligible Anthropic ones first since
// most Orchentra users sign in with their Claude Pro / Max subscription.
export const MODEL_CATALOG: readonly ModelOption[] = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'Anthropic', hint: 'most capable, slower' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', hint: 'balanced default' },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    hint: 'fastest, cheapest',
  },
  { id: 'gpt-5', label: 'GPT-5', provider: 'OpenAI' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google' },
  { id: 'grok-4', label: 'Grok 4', provider: 'xAI' },
]

export function ModelPickerCard(props: ModelPickerCardProps): React.ReactElement {
  const initialIndex = Math.max(
    0,
    MODEL_CATALOG.findIndex((m) => m.id === props.current),
  )
  const [index, setIndex] = useState(initialIndex)

  useInput(
    (_input, key) => {
      if (key.escape || (key.ctrl && _input === 'c')) {
        props.onCancel()
        return
      }
      if (key.upArrow) {
        setIndex((i) => (i === 0 ? MODEL_CATALOG.length - 1 : i - 1))
        return
      }
      if (key.downArrow) {
        setIndex((i) => (i + 1) % MODEL_CATALOG.length)
        return
      }
      if (key.return) {
        const picked = MODEL_CATALOG[index]
        if (picked) props.onPick(picked.id)
        return
      }
    },
    { isActive: true },
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Switch model
      </Text>
      <Box height={1} />
      {MODEL_CATALOG.map((m, i) => {
        const active = i === index
        const isCurrent = m.id === props.current
        return (
          <Box key={m.id} flexDirection="row">
            <Text color={active ? 'cyan' : undefined}>{active ? '❯ ' : '  '}</Text>
            <Text color={active ? 'cyan' : undefined} bold={active}>
              {m.label}
            </Text>
            <Text dimColor>{`  ${m.provider}`}</Text>
            {m.hint ? <Text dimColor>{` · ${m.hint}`}</Text> : null}
            {isCurrent ? <Text color="green">{'  (current)'}</Text> : null}
          </Box>
        )
      })}
      <Box height={1} />
      <Text dimColor>↑/↓ to move · Enter to select · Esc to cancel</Text>
    </Box>
  )
}
