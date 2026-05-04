import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'

export interface CollapsibleBlockProps {
  readonly lines: readonly string[]
  readonly expanded: boolean
  readonly collapsedTo: number
  /**
   * Optional override for the hidden-line count shown in the collapsed
   * summary. Use this when the caller has already truncated `lines` (for
   * example because it applied a char-budget on top of line counting) — pass
   * the real number of hidden lines so the summary stays accurate.
   */
  readonly summaryHidden?: number
  readonly expandHint?: string
  readonly collapseHint?: string
}

const DEFAULT_EXPAND_HINT = '(ctrl+o to expand)'
const DEFAULT_COLLAPSE_HINT = '(ctrl+o to collapse)'

export function CollapsibleBlock(props: CollapsibleBlockProps): React.ReactElement {
  const { lines, expanded, collapsedTo } = props
  const expandHint = props.expandHint ?? DEFAULT_EXPAND_HINT
  const collapseHint = props.collapseHint ?? DEFAULT_COLLAPSE_HINT

  const callerOverride = props.summaryHidden
  const visible = expanded || callerOverride !== undefined ? lines : lines.slice(0, Math.max(0, collapsedTo))
  const computedHidden = expanded ? 0 : Math.max(0, lines.length - collapsedTo)
  const hidden = callerOverride ?? computedHidden
  const isTruncatable = callerOverride !== undefined ? callerOverride > 0 : lines.length > collapsedTo

  return (
    <Box flexDirection="column">
      {visible.map((line, i) => (
        <Box key={i} flexDirection="row">
          <Text color={THEME.muted}>{i === 0 ? '  ⎿  ' : '     '}</Text>
          <Text dimColor>{line}</Text>
        </Box>
      ))}
      {!expanded && hidden > 0 ? (
        <Box flexDirection="row">
          <Text color={THEME.muted}>{'     '}</Text>
          <Text dimColor>{`… +${hidden} line${hidden === 1 ? '' : 's'} ${expandHint}`}</Text>
        </Box>
      ) : null}
      {expanded && isTruncatable ? (
        <Box flexDirection="row">
          <Text color={THEME.muted}>{'     '}</Text>
          <Text dimColor>{collapseHint}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
