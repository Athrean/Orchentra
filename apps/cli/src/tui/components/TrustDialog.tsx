import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { THEME } from '../theme'

export type TrustChoice = 'trust' | 'exit'

export interface TrustDialogProps {
  /** Absolute path of the workspace being entered for the first time. */
  readonly cwd: string
  readonly onChoose: (choice: TrustChoice) => void
}

const OPTIONS: readonly { readonly label: string; readonly choice: TrustChoice }[] = [
  { label: '1. Yes, I trust this folder', choice: 'trust' },
  { label: '2. No, exit', choice: 'exit' },
]

/**
 * One-time gate shown the first time the CLI is opened in a directory the user
 * has not yet trusted. Until it is answered the main input handler is disabled,
 * so no prompt can be submitted and no tool can run — the same "confirm before
 * you let an agent loose on these files" guard the reference TrustDialog gives.
 */
export function TrustDialog(props: TrustDialogProps): React.ReactElement {
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.escape) return props.onChoose('exit')
    if (key.upArrow) return setSelected((i) => (i - 1 + OPTIONS.length) % OPTIONS.length)
    if (key.downArrow) return setSelected((i) => (i + 1) % OPTIONS.length)
    if (input === '1') return props.onChoose('trust')
    if (input === '2') return props.onChoose('exit')
    if (key.return) return props.onChoose(OPTIONS[selected]!.choice)
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Do you trust the files in this folder?
      </Text>
      <Text dimColor>{props.cwd}</Text>
      <Box height={1} />
      <Text>Orchentra may read, edit, and run commands against files here. Only continue in a folder you trust.</Text>
      <Box height={1} />
      {OPTIONS.map((opt, i) => (
        <Text key={opt.choice} color={i === selected ? THEME.brand : undefined}>
          {i === selected ? '❯ ' : '  '}
          {opt.label}
        </Text>
      ))}
      <Box height={1} />
      <Text dimColor>Enter to choose · Esc to exit</Text>
    </Box>
  )
}
