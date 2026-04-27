import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import { Tabs } from './Tabs'
import { CardSections } from './CardSections'
import type { ActiveCardState } from '../types'

export interface ActiveCardProps {
  readonly card: ActiveCardState
}

/**
 * Borderless interactive card. Renders as:
 *
 *   <horizontal rule>
 *   <tabs row>
 *
 *   <sections>
 *
 *   ←/→/tab to switch · ↓ to return · Esc to close
 *
 * Lives in the TUI live region (not in <Static>), so the user can switch
 * tabs with arrow keys / Tab and dismiss with ↓ or Esc.
 */
export function ActiveCard(props: ActiveCardProps): React.ReactElement {
  const card = props.card
  const sections = card.sectionsByTab[card.activeTab] ?? []
  const hasTabs = !!card.tabs && card.tabs.items.length > 0

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>{rule(80)}</Text>
      {hasTabs ? <Tabs items={card.tabs!.items} active={card.activeTab} /> : null}
      {hasTabs ? <Box height={1} /> : null}
      <CardSections sections={sections} />
      <Box height={1} />
      <Text dimColor>
        {`${THEME.bullet} ←/→/tab to switch  ${THEME.bullet} ↓ to return  ${THEME.bullet} Esc to close`}
      </Text>
    </Box>
  )
}

function rule(width: number): string {
  return THEME.rule.repeat(width)
}
