import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { THEME } from '../theme'
import { MODEL_CATALOG, type ModelOption } from '../../model-catalog'

export type { ModelOption }
export { MODEL_CATALOG }

export interface ModelPickerCardProps {
  readonly current: string
  readonly onPick: (modelId: string) => void
  readonly onCancel: () => void
}

export function ModelPickerCard(props: ModelPickerCardProps): React.ReactElement {
  const initialIndex = Math.max(
    0,
    MODEL_CATALOG.findIndex((m) => m.id === props.current),
  )
  const [index, setIndex] = useState(initialIndex)

  useInput(
    (_input, key) => {
      if (key.escape || (key.ctrl && _input === 'c')) {
        props.onCancel()
        return
      }
      if (key.upArrow) {
        setIndex((i) => (i === 0 ? MODEL_CATALOG.length - 1 : i - 1))
        return
      }
      if (key.downArrow) {
        setIndex((i) => (i + 1) % MODEL_CATALOG.length)
        return
      }
      if (key.return) {
        const picked = MODEL_CATALOG[index]
        if (picked) props.onPick(picked.id)
        return
      }
    },
    { isActive: true },
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Switch model
      </Text>
      <Box height={1} />
      {MODEL_CATALOG.map((m, i) => {
        const active = i === index
        const isCurrent = m.id === props.current
        return (
          <Box key={m.id} flexDirection="row">
            <Text color={active ? THEME.brand : undefined}>{active ? '❯ ' : '  '}</Text>
            <Text color={active ? THEME.brand : undefined} bold={active}>
              {m.label}
            </Text>
            <Text dimColor>{`  ${m.provider}`}</Text>
            {m.hint ? <Text dimColor>{` · ${m.hint}`}</Text> : null}
            {isCurrent ? <Text color={THEME.brand}>{'  (current)'}</Text> : null}
          </Box>
        )
      })}
      <Box height={1} />
      <Text dimColor>↑/↓ to move · Enter to select · Esc to cancel</Text>
    </Box>
  )
}
