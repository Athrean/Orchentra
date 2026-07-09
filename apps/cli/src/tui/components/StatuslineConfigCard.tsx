import React, { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  DEFAULT_STATUSLINE_CONFIG,
  STATUSLINE_OPTIONS,
  type StatuslineConfig,
  type StatuslineFieldId,
  type StatuslineOption,
} from '../../statusline'
import { THEME } from '../theme'

export interface StatuslineConfigCardProps {
  readonly current: StatuslineConfig
  readonly onSave: (config: StatuslineConfig) => void
  readonly onCancel: () => void
}

type Row =
  | { readonly kind: 'theme'; readonly label: string; readonly description: string; readonly supported: true }
  | (StatuslineOption & { readonly kind: 'field' })

const MAX_VISIBLE_ROWS = 12

export function StatuslineConfigCard(props: StatuslineConfigCardProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [useThemeColors, setUseThemeColors] = useState(props.current.useThemeColors)
  const [fields, setFields] = useState<readonly StatuslineFieldId[]>(props.current.fields)

  const rows = useMemo(() => filterRows(query), [query])
  const clampedIndex = rows.length === 0 ? 0 : Math.min(index, rows.length - 1)
  const visibleRows = visibleWindow(rows, clampedIndex)

  useInput(
    (input, key) => {
      if (key.escape || (key.ctrl && input === 'c')) {
        props.onCancel()
        return
      }
      if (key.return) {
        props.onSave({ useThemeColors, fields })
        return
      }
      if (key.upArrow) {
        if (rows.length === 0) return
        setIndex((i) => (i <= 0 ? rows.length - 1 : i - 1))
        return
      }
      if (key.downArrow) {
        if (rows.length === 0) return
        setIndex((i) => (i + 1) % rows.length)
        return
      }
      if (input === ' ') {
        const row = rows[clampedIndex]
        if (row) toggle(row, fields, setFields, useThemeColors, setUseThemeColors)
        return
      }
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1))
        setIndex(0)
        return
      }
      if (input.length > 0 && !key.ctrl && !key.meta) {
        setQuery((q) => q + input)
        setIndex(0)
      }
    },
    { isActive: true },
  )

  const labelW = rows.reduce((width, row) => Math.max(width, row.label.length), 0)
  const selected = new Set(fields)

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={THEME.muted} paddingX={1}>
      <Text bold>Configure Status Line</Text>
      <Text dimColor>Select which items to display in the status line.</Text>
      <Text dimColor>{`Current: ${summarizeFields(fields)}`}</Text>
      <Box height={1} />
      <Text dimColor>Type to search</Text>
      <Text dimColor>{`> ${query}`}</Text>
      {rows.length === 0 ? (
        <Text dimColor>no matching status line items</Text>
      ) : (
        visibleRows.map((row, visibleIndex) => {
          const rowIndex = visibleRows.start + visibleIndex
          const active = rowIndex === clampedIndex
          const checked = row.kind === 'theme' ? useThemeColors : selected.has(row.id)
          const disabled = !row.supported
          return (
            <Box key={row.kind === 'theme' ? 'theme' : row.id} flexDirection="row">
              <Text color={active ? THEME.brand : undefined}>{active ? '› ' : '  '}</Text>
              <Text color={active && !disabled ? THEME.brand : disabled ? THEME.muted : undefined} bold={active}>
                {`[${checked ? 'x' : ' '}] ${row.label}`.padEnd(labelW + 4)}
              </Text>
              <Text color={active && !disabled ? THEME.brand : undefined} dimColor={disabled}>
                {`  ${row.description}${disabled ? ' (unavailable)' : ''}`}
              </Text>
            </Box>
          )
        })
      )}
      <Box height={1} />
      <Text dimColor>Press space to toggle; ↑/↓ to move; enter to apply now; esc to close</Text>
    </Box>
  )
}

function filterRows(query: string): readonly Row[] {
  const rows: Row[] = [
    {
      kind: 'theme',
      label: 'use theme colors',
      description: 'Apply colors from the active /theme',
      supported: true,
    },
    ...STATUSLINE_OPTIONS.map((option) => ({ ...option, kind: 'field' as const })),
  ]
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) => `${row.label} ${row.description}`.toLowerCase().includes(q))
}

function visibleWindow(rows: readonly Row[], index: number): readonly Row[] & { readonly start: number } {
  if (rows.length <= MAX_VISIBLE_ROWS) return Object.assign(rows, { start: 0 })
  const half = Math.floor(MAX_VISIBLE_ROWS / 2)
  const start = Math.min(Math.max(index - half, 0), rows.length - MAX_VISIBLE_ROWS)
  return Object.assign(rows.slice(start, start + MAX_VISIBLE_ROWS), { start })
}

function toggle(
  row: Row,
  fields: readonly StatuslineFieldId[],
  setFields: (fields: readonly StatuslineFieldId[]) => void,
  useThemeColors: boolean,
  setUseThemeColors: (enabled: boolean) => void,
): void {
  if (row.kind === 'theme') {
    setUseThemeColors(!useThemeColors)
    return
  }
  if (!row.supported) return
  if (fields.includes(row.id)) {
    const next = fields.filter((field) => field !== row.id)
    setFields(next.length > 0 ? next : DEFAULT_STATUSLINE_CONFIG.fields)
    return
  }
  setFields([...fields, row.id])
}

function summarizeFields(fields: readonly StatuslineFieldId[]): string {
  const labels = fields
    .map((field) => STATUSLINE_OPTIONS.find((option) => option.id === field)?.label)
    .filter((label): label is string => !!label)
  if (labels.length === 0) return 'default'
  if (labels.length <= 4) return labels.join(', ')
  return `${labels.slice(0, 4).join(', ')} +${labels.length - 4} more`
}
