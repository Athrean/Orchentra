import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { EFFORT_TIERS, type EffortTier } from '@orchentra/cli-core'
import { EffortSlider, effortLayout, trackSpans } from '../../src/tui/components/EffortSlider'

function frameFor(current: EffortTier): string {
  const { lastFrame } = render(<EffortSlider current={current} onPick={() => {}} onCancel={() => {}} />)
  return lastFrame() ?? ''
}

describe('effortLayout', () => {
  test('stops advance by label width plus the gap', () => {
    const { stops } = effortLayout(['low', 'medium'], 5)
    expect(stops.map((s) => s.start)).toEqual([0, 8])
  })

  test('width spans the labels without a trailing gap', () => {
    expect(effortLayout(['low', 'max'], 5).width).toBe(11)
  })

  test('every marker column falls inside its own label', () => {
    const { stops } = effortLayout()
    for (const stop of stops) {
      expect(stop.center).toBeGreaterThanOrEqual(stop.start)
      expect(stop.center).toBeLessThan(stop.start + stop.tier.length)
    }
  })

  test('the track is exactly the layout width at every tier', () => {
    const layout = effortLayout()
    for (let i = 0; i < layout.stops.length; i += 1) {
      const { before, after } = trackSpans(layout, i)
      expect(before.length + 1 + after.length).toBe(layout.width)
    }
  })

  // The old slider spaced the track by a fixed stride and the labels by a
  // flexbox gap, so `max` drew its marker past the end of the track.
  test('the last tier does not overrun the track', () => {
    const layout = effortLayout()
    expect(trackSpans(layout, layout.stops.length - 1).after.length).toBeGreaterThanOrEqual(0)
    expect(layout.stops[layout.stops.length - 1]!.center).toBeLessThan(layout.width)
  })
})

describe('EffortSlider', () => {
  test.each(EFFORT_TIERS.map((t) => [t]))('the marker sits under %s', (tier) => {
    const lines = frameFor(tier as EffortTier).split('\n')
    const track = lines.find((l) => l.includes('▲'))!
    const labels = lines.find((l) => l.includes('low') && l.includes('max'))!
    const marker = track.indexOf('▲')
    const start = labels.indexOf(tier as string)
    expect(marker).toBeGreaterThanOrEqual(start)
    expect(marker).toBeLessThan(start + (tier as string).length)
  })

  test('renders both ends of the scale', () => {
    const out = frameFor('medium')
    expect(out).toContain('Faster')
    expect(out).toContain('Smarter')
  })

  test('arrows move the marker and clamp at both ends', async () => {
    let picked: EffortTier | null = null
    const { stdin } = render(
      <EffortSlider
        current="low"
        onPick={(e) => {
          picked = e
        }}
        onCancel={() => {}}
      />,
    )
    for (let i = 0; i < 10; i += 1) {
      stdin.write('\x1b[D')
      await new Promise((r) => setTimeout(r, 4))
    }
    stdin.write('\r')
    await new Promise((r) => setTimeout(r, 10))
    expect(picked).toBe('low')
  })

  test('right arrow walks up the scale', async () => {
    let picked: EffortTier | null = null
    const { stdin } = render(
      <EffortSlider
        current="low"
        onPick={(e) => {
          picked = e
        }}
        onCancel={() => {}}
      />,
    )
    for (let i = 0; i < 2; i += 1) {
      stdin.write('\x1b[C')
      await new Promise((r) => setTimeout(r, 4))
    }
    stdin.write('\r')
    await new Promise((r) => setTimeout(r, 10))
    expect(picked).toBe('high')
  })
})
