import React, { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { CommandRegistry, SlashCommandSpec } from '../../commands/registry'
import { fuzzyScore } from '../suggestions/fuzzy'
import { THEME } from '../theme'

export interface CommandPaletteProps {
  readonly registry: CommandRegistry
  readonly onPick: (command: string) => void
  readonly onCancel: () => void
}

const MAX_ITEMS = 8

export function CommandPalette(props: CommandPaletteProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const items = useMemo(() => filterCommands(props.registry, query), [props.registry, query])
  const selected = items.length === 0 ? 0 : Math.min(index, items.length - 1)
  const labelW = items.reduce((m, item) => Math.max(m, item.name.length + 1), 0)

  useInput(
    (input, key) => {
      if (key.escape || (key.ctrl && input === 'c')) {
        props.onCancel()
        return
      }
      if (key.upArrow) {
        setIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length))
        return
      }
      if (key.downArrow) {
        setIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length))
        return
      }
      if (key.return) {
        const picked = items[selected]
        if (picked) props.onPick(`/${picked.name}`)
        return
      }
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1))
        setIndex(0)
        return
      }
      if (input && input.length > 0 && !key.ctrl && !key.meta) {
        setQuery((q) => q + input)
        setIndex(0)
      }
    },
    { isActive: true },
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Command palette
      </Text>
      <Text dimColor>{`/${query}`}</Text>
      <Box height={1} />
      {items.length === 0 ? (
        <Text dimColor>No commands match</Text>
      ) : (
        items.map((item, i) => {
          const active = i === selected
          const label = `/${item.name}`.padEnd(labelW, ' ')
          const hint = item.argumentHint ? ` ${item.argumentHint}` : ''
          return (
            <Box key={item.name} flexDirection="row">
              <Text color={active ? THEME.brand : undefined}>{active ? '❯ ' : '  '}</Text>
              <Text color={active ? THEME.brand : undefined} bold={active}>
                {label}
              </Text>
              <Text dimColor>{hint ? `${hint}  ${item.summary}` : `  ${item.summary}`}</Text>
            </Box>
          )
        })
      )}
      <Box height={1} />
      <Text dimColor>Type to filter · ↑/↓ to move · Enter to insert · Esc to close</Text>
    </Box>
  )
}

function filterCommands(registry: CommandRegistry, query: string): SlashCommandSpec[] {
  const specs = registry.allSpecs()
  if (query.length === 0) return specs.slice(0, MAX_ITEMS)

  const scored: { spec: SlashCommandSpec; score: number }[] = []
  for (const spec of specs) {
    const result = fuzzyScore(query, spec.name)
    if (result) scored.push({ spec, score: result.score })
  }
  scored.sort((a, b) => b.score - a.score || a.spec.name.localeCompare(b.spec.name))
  return scored.slice(0, MAX_ITEMS).map(({ spec }) => spec)
}
