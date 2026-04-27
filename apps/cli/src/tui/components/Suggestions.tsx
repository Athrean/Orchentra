import React from 'react'
import { Box, Text } from 'ink'
import { BRAND_GREEN, type SuggestionItem, type SuggestionState, type SuggestionTrigger } from '../types'

export interface SuggestionsProps {
  readonly state: SuggestionState
  /** Width to align the box to; falls back to ink's natural sizing. */
  readonly width?: number
}

const TRIGGER_TITLE: Record<SuggestionTrigger, string> = {
  '/': 'commands',
  '@': 'files',
  '!': 'shell',
}

/**
 * Dropdown rendered just above the input box. Brand-green selection bar.
 * Hidden when `state.open` is false; the parent should not render at all in
 * that case (this just no-ops defensively).
 */
export function Suggestions(props: SuggestionsProps): React.ReactElement | null {
  const { state, width } = props
  if (!state.open || state.items.length === 0 || state.trigger === null) return null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={BRAND_GREEN} paddingX={1} width={width}>
      <Box>
        <Text color={BRAND_GREEN} bold>
          {state.trigger}
        </Text>
        <Text dimColor> {TRIGGER_TITLE[state.trigger]}</Text>
        {state.query.length > 0 ? (
          <>
            <Text dimColor> · </Text>
            <Text>{state.query}</Text>
          </>
        ) : null}
      </Box>
      {state.items.map((item, index) => (
        <Row key={`${index}-${item.value}`} item={item} selected={index === state.selected} />
      ))}
      <Box>
        <Text dimColor>↑↓ select · Tab/Enter accept · Esc close</Text>
      </Box>
    </Box>
  )
}

interface RowProps {
  readonly item: SuggestionItem
  readonly selected: boolean
}

function Row(props: RowProps): React.ReactElement {
  const { item, selected } = props
  const arrow = selected ? '›' : ' '
  const labelColor = selected ? BRAND_GREEN : undefined
  return (
    <Box>
      <Text color={BRAND_GREEN} bold={selected}>
        {arrow}{' '}
      </Text>
      <Text bold={selected} color={labelColor}>
        {item.label}
      </Text>
      {item.hint ? <Text dimColor> {item.hint}</Text> : null}
      {item.description ? (
        <Text dimColor>
          {'  '}
          {item.description}
        </Text>
      ) : null}
    </Box>
  )
}
