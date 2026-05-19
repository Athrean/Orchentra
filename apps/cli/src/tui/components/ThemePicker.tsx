import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { THEMES, themeNames, type ThemeName } from '../theme-registry'
import { ThemeProvider, useTheme } from '../use-theme'

export interface ThemePickerProps {
  readonly current: ThemeName
  /**
   * When set, the picker renders under this theme rather than `current`. The
   * Tui flow handler passes the highlighted theme here so the whole overlay
   * (including border + accents) previews live as the user moves the cursor.
   */
  readonly preview?: ThemeName
  readonly onPick: (name: ThemeName) => void
  readonly onCancel: () => void
}

/**
 * Arrow-key theme picker overlay. Mirrors the structural pattern of
 * `ModelPickerCard` and `RepoPickerCard`: cursor starts on `current`,
 * ↑/↓ moves, Enter commits, Esc cancels.
 *
 * The component is wrapped in its own `ThemeProvider` so subordinate rows
 * recolour during live preview without forcing the whole TUI to re-render
 * through a context push.
 */
export function ThemePicker(props: ThemePickerProps): React.ReactElement {
  const names = themeNames()
  const initialIndex = Math.max(0, names.indexOf(props.current))
  const [index, setIndex] = useState(initialIndex)

  useInput(
    (input, key) => {
      if (key.escape || (key.ctrl && input === 'c')) {
        props.onCancel()
        return
      }
      if (key.upArrow) {
        setIndex((i) => (i === 0 ? names.length - 1 : i - 1))
        return
      }
      if (key.downArrow) {
        setIndex((i) => (i + 1) % names.length)
        return
      }
      if (key.return) {
        const picked = names[index]
        if (picked) props.onPick(picked)
        return
      }
    },
    { isActive: true },
  )

  const previewName: ThemeName = props.preview ?? names[index] ?? props.current
  const themeForRender = THEMES[previewName]

  return (
    <ThemeProvider theme={themeForRender}>
      <ThemePickerBody current={props.current} index={index} />
    </ThemeProvider>
  )
}

interface ThemePickerBodyProps {
  readonly current: ThemeName
  readonly index: number
}

function ThemePickerBody(props: ThemePickerBodyProps): React.ReactElement {
  const theme = useTheme()
  const names = themeNames()
  const labelW = names.reduce((m, n) => Math.max(m, n.length), 0)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.brand} paddingX={1}>
      <Text color={theme.brand} bold>
        Theme
      </Text>
      <Box height={1} />
      {names.map((name, i) => {
        const active = i === props.index
        const isCurrent = name === props.current
        const hint = describeTheme(name)
        return (
          <Box key={name} flexDirection="row">
            <Text color={active ? theme.brand : undefined}>{active ? '❯ ' : '  '}</Text>
            <Text color={active ? theme.brand : undefined} bold={active}>
              {name.padEnd(labelW, ' ')}
            </Text>
            <Text dimColor>{`  ${hint}`}</Text>
            {isCurrent ? <Text color={theme.brand}>{'  (current)'}</Text> : null}
          </Box>
        )
      })}
      <Box height={1} />
      <Text dimColor>↑/↓ to move · Enter to select · Esc to cancel</Text>
    </Box>
  )
}

function describeTheme(name: ThemeName): string {
  switch (name) {
    case 'dark':
      return 'Default dark palette · truecolor'
    case 'light':
      return 'Light-mode inverse · for white backgrounds'
    case 'dark-ansi':
      return '16-colour ANSI fallback · plain terminals'
  }
}
