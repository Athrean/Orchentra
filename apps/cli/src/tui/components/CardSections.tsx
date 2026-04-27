import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import { KVList } from './KVList'
import type { UiCardSection } from '../../commands/ui-output'

export interface CardSectionsProps {
  readonly sections: readonly UiCardSection[]
}

export function CardSections(props: CardSectionsProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.sections.map((section, i) => (
        <Box key={i} flexDirection="column">
          {section.title ? (
            <Text bold color={THEME.brand}>
              {section.title}
            </Text>
          ) : null}
          <KVList rows={section.rows.map((r) => ({ ...r }))} />
          {i < props.sections.length - 1 ? <Box height={1} /> : null}
        </Box>
      ))}
    </Box>
  )
}
