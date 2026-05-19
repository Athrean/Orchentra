import React from 'react'
import { Box, Text } from 'ink'
import { BRAND_GREEN, type PasteChip } from '../types'
import { THEME } from '../theme'

export interface InputModalProps {
  readonly buffer: string
  readonly cursor: number
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly pastes: Readonly<Record<string, PasteChip>>
}

const CHIP_RE = /\[Pasted #([a-z0-9]+) — (\d+) lines]/g

/**
 * Modal variant of `InputBox` shown when the buffer wraps to ≥ 5 rows.
 * Adds a title bar ("multi-line edit") and a richer footer that surfaces
 * the editor-shortcut keys; keyboard handling is unchanged because Tui's
 * single `useInput` block still owns every keystroke. We simply give the
 * user a clearer visual frame so they know they're in multi-line mode.
 */
export function InputModal(props: InputModalProps): React.ReactElement {
  const { buffer, cursor, placeholder, disabled } = props
  const showPlaceholder = buffer.length === 0 && !!placeholder
  const promptColor = disabled ? THEME.muted : BRAND_GREEN

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text color={THEME.accent}>{`✦ multi-line edit `}</Text>
        <Text dimColor>· ctrl+x ctrl+e for $EDITOR · esc to collapse</Text>
      </Box>
      <Box borderStyle="single" borderColor={THEME.accent} borderDimColor paddingX={1} flexDirection="row">
        <Text color={promptColor} bold>
          {`${THEME.prompt} `}
        </Text>
        <Box flexDirection="column" flexGrow={1}>
          {showPlaceholder ? (
            <Text dimColor>{placeholder}</Text>
          ) : (
            <BufferText buffer={buffer} cursor={disabled ? -1 : cursor} />
          )}
        </Box>
      </Box>
      <Box paddingX={1}>
        <Text dimColor>shift+enter / alt+enter for newline · enter to submit</Text>
      </Box>
    </Box>
  )
}

interface BufferTextProps {
  readonly buffer: string
  readonly cursor: number
}

function BufferText(props: BufferTextProps): React.ReactElement {
  const { buffer, cursor } = props
  if (cursor < 0) return <Text>{renderWithChips(buffer)}</Text>
  const before = buffer.slice(0, cursor)
  const at = buffer[cursor] ?? ' '
  const after = buffer.slice(cursor + 1)
  return (
    <Text>
      {renderWithChips(before)}
      <Text inverse>{at === '\n' ? ' ' : at}</Text>
      {at === '\n' ? '\n' : null}
      {renderWithChips(after)}
    </Text>
  )
}

function renderWithChips(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  CHIP_RE.lastIndex = 0
  while ((match = CHIP_RE.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index))
    const lines = match[2]
    out.push(
      <Text key={`${match.index}-${match[1]}`} color={BRAND_GREEN} bold>
        {`[paste · ${lines} lines]`}
      </Text>,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex))
  if (out.length === 0) out.push(text)
  return out
}
