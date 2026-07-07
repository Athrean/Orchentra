import React from 'react'
import { Box, Text } from 'ink'

export interface KVRow {
  readonly key: string
  readonly value: string
  /** Optional override for the value's text colour (e.g. mode accent). */
  readonly valueColor?: string
  /** Render value bold. Defaults false. */
  readonly bold?: boolean
}

export interface KVListProps {
  readonly rows: readonly KVRow[]
  /** Optional fixed key column width. If omitted, auto-fit to longest key. */
  readonly keyWidth?: number
}

export function KVList(props: KVListProps): React.ReactElement {
  const width = props.keyWidth ?? Math.max(...props.rows.map((r) => r.key.length))
  return (
    <Box flexDirection="column">
      {props.rows.map((row) => (
        <Box key={row.key} flexDirection="row">
          <Text dimColor>{row.key.padEnd(width)}</Text>
          <Text>{'  '}</Text>
          <Text color={row.valueColor} bold={row.bold}>
            {row.value}
          </Text>
        </Box>
      ))}
    </Box>
  )
}
