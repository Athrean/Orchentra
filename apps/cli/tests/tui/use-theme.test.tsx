import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { Text } from 'ink'

import { ThemeProvider, useTheme } from '../../src/tui/use-theme'
import { THEMES } from '../../src/tui/theme-registry'

function ShowBrand(): React.ReactElement {
  const theme = useTheme()
  return <Text>{`brand=${theme.brand}`}</Text>
}

describe('useTheme', () => {
  test('returns the dark theme by default when no provider is mounted', () => {
    const { lastFrame } = render(<ShowBrand />)
    expect(lastFrame() ?? '').toContain(`brand=${THEMES.dark.brand}`)
  })

  test('returns the provider value when wrapped', () => {
    const { lastFrame } = render(
      <ThemeProvider theme={THEMES.light}>
        <ShowBrand />
      </ThemeProvider>,
    )
    expect(lastFrame() ?? '').toContain(`brand=${THEMES.light.brand}`)
  })
})
