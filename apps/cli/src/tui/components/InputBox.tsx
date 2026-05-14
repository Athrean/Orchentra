import React from 'react'
import { Box, Text } from 'ink'
import { BRAND_GREEN, type PasteChip } from '../types'
import { THEME } from '../theme'

export interface InputBoxProps {
  readonly buffer: string
  readonly cursor: number
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly pastes: Readonly<Record<string, PasteChip>>
  /**
   * When false, render as a bare `> ` line with no round border. Used inside
   * IDE-integrated terminals (VSCode / Cursor) where the host treats the
   * screen as an infinite-scrollback buffer — each SIGWINCH during a panel
   * resize re-paints the border into scrollback instead of overwriting it
   * in place, producing a column of stacked phantom boxes. A 1-line dynamic
   * region avoids that entirely. Defaults to true (real terminals).
   */
  readonly bordered?: boolean
}

const CHIP_RE = /\[Pasted #([a-z0-9]+) — (\d+) lines]/g

/**
 * Rounded, brand-green input box. Renders the buffer with an inverse-character
 * cursor so we don't have to manage the real terminal cursor position. Paste
 * chips inside the buffer are rendered as a single dim/bold token instead of
 * the full pasted contents.
 */
export function InputBox(props: InputBoxProps): React.ReactElement {
  const { buffer, cursor, placeholder, disabled, bordered = true } = props
  const showPlaceholder = buffer.length === 0 && !!placeholder
  // Surface the multi-line affordance only once the buffer actually wraps.
  // Permanent hints belong behind `?` (per CLAUDE.md §8); a contextual hint
  // only when the user has produced a newline keeps idle frames quiet.
  const showMultilineHint = !disabled && buffer.includes('\n')

  const promptColor = disabled ? THEME.muted : BRAND_GREEN
  const content = (
    <>
      <Text color={promptColor} bold>
        {'> '}
      </Text>
      <Box flexDirection="column" flexGrow={1}>
        {showPlaceholder ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <BufferText buffer={buffer} cursor={disabled ? -1 : cursor} />
        )}
      </Box>
    </>
  )

  return (
    <Box flexDirection="column">
      {bordered ? (
        <Box borderStyle="round" borderColor={promptColor} paddingX={1} flexDirection="row">
          {content}
        </Box>
      ) : (
        <Box paddingX={1} flexDirection="row">
          {content}
        </Box>
      )}
      {showMultilineHint ? (
        <Box paddingX={1}>
          <Text dimColor>shift+enter for newline · enter to submit</Text>
        </Box>
      ) : null}
    </Box>
  )
}

interface BufferTextProps {
  readonly buffer: string
  /** -1 hides the cursor entirely. */
  readonly cursor: number
}

function BufferText(props: BufferTextProps): React.ReactElement {
  const { buffer, cursor } = props
  if (cursor < 0) {
    return <Text>{renderWithChips(buffer)}</Text>
  }
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

/**
 * Replace `[Pasted #abc — 12 lines]` markers with a styled chip element.
 * Returns an array of strings + React nodes that Ink's `<Text>` renders
 * inline.
 */
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
