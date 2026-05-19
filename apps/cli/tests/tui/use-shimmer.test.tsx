import { describe, expect, test } from 'bun:test'
import React from 'react'
import { Text } from 'ink'
import { render } from 'ink-testing-library'
import { pickShimmer, useShimmer } from '../../src/tui/hooks/use-shimmer'

function Probe(props: { readonly active: boolean; readonly intervalMs: number }): React.ReactElement {
  const tick = useShimmer({ active: props.active, intervalMs: props.intervalMs })
  return <Text>tick={tick}</Text>
}

describe('useShimmer', () => {
  test('starts at 0 and advances on interval while active', async () => {
    const { lastFrame, rerender } = render(<Probe active={true} intervalMs={20} />)
    expect(lastFrame()).toContain('tick=0')
    await Bun.sleep(120)
    rerender(<Probe active={true} intervalMs={20} />)
    // After ~120ms with a 20ms interval, tick should have advanced past 0.
    expect(lastFrame()).not.toContain('tick=0')
  })

  test('does not advance when inactive', async () => {
    const { lastFrame, rerender } = render(<Probe active={false} intervalMs={20} />)
    expect(lastFrame()).toContain('tick=0')
    await Bun.sleep(120)
    rerender(<Probe active={false} intervalMs={20} />)
    expect(lastFrame()).toContain('tick=0')
  })

  test('freezes the tick when active flips false', async () => {
    const { lastFrame, rerender } = render(<Probe active={true} intervalMs={20} />)
    await Bun.sleep(80)
    rerender(<Probe active={false} intervalMs={20} />)
    const frozen = lastFrame()
    await Bun.sleep(80)
    rerender(<Probe active={false} intervalMs={20} />)
    expect(lastFrame()).toBe(frozen)
  })
})

describe('pickShimmer', () => {
  test('cycles through the palette deterministically', () => {
    const palette = ['a', 'b'] as const
    expect(pickShimmer(palette, 0)).toBe('a')
    expect(pickShimmer(palette, 1)).toBe('b')
    expect(pickShimmer(palette, 2)).toBe('a')
    expect(pickShimmer(palette, 3)).toBe('b')
  })

  test('throws on an empty palette', () => {
    expect(() => pickShimmer([], 0)).toThrow()
  })
})
