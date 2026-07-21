import React from 'react'
import { Box, Text } from 'ink'
import { BRAND_GREEN, type SuggestionItem, type SuggestionState } from '../types'

export interface SuggestionsProps {
  readonly state: SuggestionState
  /** Width to align the row to; falls back to ink's natural sizing. */
  readonly width?: number
}

const PREFIX = '  '
const SELECTED = '› '
const GUTTER = '  '

/**
 * Dropdown rendered just below the input box. Borderless, two-column:
 * label (fixed-width, brand-green for selected row) and description
 * (dim, truncated to terminal width).
 */
export function Suggestions(props: SuggestionsProps): React.ReactElement | null {
  const { state, width } = props
  if (!state.open || state.items.length === 0 || state.trigger === null) return null

  const labelW = state.items.reduce((m, it) => Math.max(m, it.label.length), 0)

  return (
    <Box flexDirection="column" width={width}>
      {state.items.map((item, index) => (
        <Row key={item.value} item={item} selected={index === state.selected} labelW={labelW} width={width} />
      ))}
    </Box>
  )
}

interface RowProps {
  readonly item: SuggestionItem
  readonly selected: boolean
  readonly labelW: number
  readonly width: number | undefined
}

function Row(props: RowProps): React.ReactElement {
  const { item, selected, labelW, width } = props
  const prefix = selected ? SELECTED : PREFIX
  const label = item.label.padEnd(labelW, ' ')
  const description = item.description ?? ''
  const descBudget =
    width !== undefined ? Math.max(0, width - prefix.length - labelW - GUTTER.length) : description.length
  const desc = truncate(description, descBudget)

  return (
    <Box flexDirection="row" width={width}>
      <Text color={selected ? BRAND_GREEN : undefined} bold={selected}>
        {prefix}
        {label}
      </Text>
      <Text dimColor>
        {GUTTER}
        {desc}
      </Text>
    </Box>
  )
}

function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  if (text.length <= max) return text
  if (max === 1) return '…'
  return `${text.slice(0, max - 1)}…`
}
