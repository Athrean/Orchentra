import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import type { HistorySearchState } from '../input/history-search'

export interface HistorySearchPromptProps {
  readonly search: HistorySearchState
  readonly history: readonly string[]
}

/**
 * Readline-style incremental reverse-search line that replaces the input box
 * while ctrl+f search is active. Shows the query and the current match; the
 * match text is brand-green when found, dim when the query has no hit yet.
 */
export function HistorySearchPrompt(props: HistorySearchPromptProps): React.ReactElement {
  const { search, history } = props
  const match = search.matchIndex === null ? null : (history[search.matchIndex] ?? null)

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="single"
        borderColor={THEME.muted}
        borderDimColor
        borderLeft={false}
        borderRight={false}
        paddingX={1}
        flexDirection="row"
      >
        <Text color={THEME.brand} bold>
          {`${THEME.prompt} `}
        </Text>
        <Text dimColor>{"(reverse-search)'"}</Text>
        <Text color={THEME.brand}>{search.query}</Text>
        <Text dimColor>{"': "}</Text>
        {match !== null ? (
          <Text>{match}</Text>
        ) : (
          <Text dimColor>{search.query.length === 0 ? 'type to search history' : 'no match'}</Text>
        )}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>↑ older · ↓ newer · enter accept · esc cancel</Text>
      </Box>
    </Box>
  )
}
