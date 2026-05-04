import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { TrustChoice } from '@orchentra/cli-core'
import { THEME } from '../theme'

export interface TrustPromptProps {
  readonly cwd: string
  readonly onChoose: (choice: TrustChoice) => void
}

const OPTIONS: readonly { readonly label: string; readonly choice: TrustChoice }[] = [
  { label: '1. Yes, trust this folder', choice: 'trust' },
  { label: '2. No, deny this folder', choice: 'deny' },
  { label: '3. Cancel (exit)', choice: 'cancel' },
]

export function TrustPrompt(props: TrustPromptProps): React.ReactElement {
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.escape) return props.onChoose('cancel')
    if (key.upArrow) return setSelected((i) => (i - 1 + OPTIONS.length) % OPTIONS.length)
    if (key.downArrow) return setSelected((i) => (i + 1) % OPTIONS.length)
    if (input === '1') return props.onChoose('trust')
    if (input === '2') return props.onChoose('deny')
    if (input === '3') return props.onChoose('cancel')
    if (key.return) return props.onChoose(OPTIONS[selected]!.choice)
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={THEME.brand} bold>
        Do you trust the files in this folder?
      </Text>
      <Text>{props.cwd}</Text>
      <Text dimColor>
        Trust executes hooks, skills, and workspace policies declared by this directory. Only trust folders you
        recognise.
      </Text>
      <Box height={1} />
      {OPTIONS.map((opt, i) => (
        <Text key={opt.choice} color={i === selected ? THEME.brand : undefined}>
          {i === selected ? '❯ ' : '  '}
          {opt.label}
        </Text>
      ))}
      <Box height={1} />
      <Text dimColor>↑/↓ to move · Enter to confirm · Esc to cancel</Text>
    </Box>
  )
}
