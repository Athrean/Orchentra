import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { THEME } from '../theme'

export type PromptChoice = 'allow-once' | 'allow-pattern' | 'deny' | 'cancel'

export interface PromptRequest {
  /** Header label, e.g. "Bash command". */
  readonly toolLabel: string
  /** Proposed command rendered with the `$ ` prefix. */
  readonly commandLine: string
  /** Optional one-line context shown below the command. */
  readonly context?: string
  /** Glob pattern offered for option 2 ("Yes, and allow this pattern"). */
  readonly allowPattern: string
  /**
   * When set, the overlay renders a red deny banner with the reason and
   * dismisses on any key — no numbered options. Used for destructive
   * patterns that the enforcer hard-denied before reaching askUser.
   */
  readonly denyBanner?: string
}

export interface ConfirmationPromptProps {
  readonly request: PromptRequest
  readonly onChoose: (choice: PromptChoice) => void
}

const OPTIONS: readonly { readonly label: string; readonly choice: PromptChoice }[] = [
  { label: '1. Yes', choice: 'allow-once' },
  { label: '2. Yes, and allow this pattern', choice: 'allow-pattern' },
  { label: '3. No', choice: 'deny' },
]

export function ConfirmationPrompt(props: ConfirmationPromptProps): React.ReactElement {
  const [selected, setSelected] = useState(0)
  const denyBanner = props.request.denyBanner

  useInput((input, key) => {
    if (denyBanner) {
      props.onChoose('deny')
      return
    }
    if (key.escape) return props.onChoose('cancel')
    if (key.upArrow) return setSelected((i) => (i - 1 + OPTIONS.length) % OPTIONS.length)
    if (key.downArrow) return setSelected((i) => (i + 1) % OPTIONS.length)
    if (input === '1') return props.onChoose('allow-once')
    if (input === '2') return props.onChoose('allow-pattern')
    if (input === '3') return props.onChoose('deny')
    if (key.return) return props.onChoose(OPTIONS[selected]!.choice)
  })

  if (denyBanner) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={THEME.danger} paddingX={1}>
        <Text color={THEME.danger} bold>
          Blocked: {props.request.toolLabel}
        </Text>
        <Text>{props.request.commandLine}</Text>
        <Box height={1} />
        <Text color={THEME.danger}>{denyBanner}</Text>
        <Box height={1} />
        <Text dimColor>Press any key to continue.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        {props.request.toolLabel}
      </Text>
      <Text>{props.request.commandLine}</Text>
      {props.request.context ? <Text dimColor>{props.request.context}</Text> : null}
      <Box height={1} />
      <Text>Do you want to proceed?</Text>
      {OPTIONS.map((opt, i) => (
        <Text key={opt.choice} color={i === selected ? THEME.brand : undefined}>
          {i === selected ? '❯ ' : '  '}
          {opt.label}
        </Text>
      ))}
      <Box height={1} />
      <Text dimColor>Esc to cancel · ctrl+e to explain</Text>
    </Box>
  )
}
