import React, { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { THEME } from '../theme'
import type { RepoPickerItem } from '../../commands/ui-output'

export interface RepoPickerCardProps {
  readonly repos: readonly RepoPickerItem[]
  readonly current: string | null
  readonly onPick: (fullName: string) => void
  readonly onCancel: () => void
}

type Tab = 'Installed' | 'All'
const TABS: readonly Tab[] = ['Installed', 'All']

function filterFor(tab: Tab, repos: readonly RepoPickerItem[]): readonly RepoPickerItem[] {
  if (tab === 'All') return repos
  return repos.filter((r) => r.installed)
}

/**
 * Interactive repo picker. Mirrors the ModelPickerCard pattern: arrow-key
 * navigation, ←/→ switches the Installed/All filter tab, Enter accepts,
 * Esc cancels. Selection persists via the caller's onPick callback (the
 * Tui wires it to setActiveRepo).
 */
export function RepoPickerCard(props: RepoPickerCardProps): React.ReactElement {
  const [tabIdx, setTabIdx] = useState(0)
  const tab = TABS[tabIdx]!
  const visible = useMemo(() => filterFor(tab, props.repos), [tab, props.repos])

  const initialIndex = Math.max(
    0,
    visible.findIndex((r) => r.fullName === props.current),
  )
  const [rowIdx, setRowIdx] = useState(initialIndex)

  // Clamp the row index if a tab switch shrinks the list.
  const clampedRow = visible.length === 0 ? 0 : Math.min(rowIdx, visible.length - 1)

  useInput(
    (_input, key) => {
      if (key.escape || (key.ctrl && _input === 'c')) {
        props.onCancel()
        return
      }
      if (key.leftArrow || key.rightArrow) {
        setTabIdx((i) => (i + (key.leftArrow ? TABS.length - 1 : 1)) % TABS.length)
        setRowIdx(0)
        return
      }
      if (key.upArrow) {
        if (visible.length === 0) return
        setRowIdx((i) => (i <= 0 ? visible.length - 1 : i - 1))
        return
      }
      if (key.downArrow) {
        if (visible.length === 0) return
        setRowIdx((i) => (i + 1) % visible.length)
        return
      }
      if (key.return) {
        const picked = visible[clampedRow]
        if (picked) props.onPick(picked.fullName)
        return
      }
    },
    { isActive: true },
  )

  const labelW = visible.reduce((m, r) => Math.max(m, r.fullName.length), 0)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Pick a repo
      </Text>
      <Box>
        {TABS.map((t, i) => (
          <Box key={t} marginRight={1}>
            <Text color={i === tabIdx ? THEME.brand : undefined} bold={i === tabIdx}>
              {i === tabIdx ? `[ ${t} ]` : `  ${t}  `}
            </Text>
          </Box>
        ))}
      </Box>
      <Box height={1} />
      {visible.length === 0 ? (
        <Text dimColor>no repos in this view</Text>
      ) : (
        visible.map((r, i) => {
          const active = i === clampedRow
          const isCurrent = r.fullName === props.current
          return (
            <Box key={r.fullName} flexDirection="row">
              <Text color={active ? THEME.brand : undefined}>{active ? '❯ ' : '  '}</Text>
              <Text color={active ? THEME.brand : undefined} bold={active}>
                {r.fullName.padEnd(labelW, ' ')}
              </Text>
              <Text dimColor>{`  ${tagsFor(r)}`}</Text>
              {isCurrent ? <Text color={THEME.brand}>{'  (current)'}</Text> : null}
            </Box>
          )
        })
      )}
      <Box height={1} />
      <Text dimColor>↑/↓ to move · ←/→ to switch tab · Enter to select · Esc to cancel</Text>
    </Box>
  )
}

function tagsFor(r: RepoPickerItem): string {
  const parts: string[] = []
  parts.push(r.installed ? '✓ installed' : '— not installed')
  if (r.monitored) parts.push('✓ monitored')
  return parts.join(' · ')
}
