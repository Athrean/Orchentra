import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { Card } from '../src/tui/components/Card'
import { KVList } from '../src/tui/components/KVList'
import { Tabs } from '../src/tui/components/Tabs'

describe('Card', () => {
  test('renders title, subtitle and children', () => {
    const { lastFrame } = render(
      <Card title="Account" subtitle="signed in">
        <></>
      </Card>,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('Account')
    expect(out).toContain('signed in')
  })
})

describe('KVList', () => {
  test('aligns keys to longest key length', () => {
    const { lastFrame } = render(
      <KVList
        rows={[
          { key: 'model', value: 'a' },
          { key: 'permission', value: 'b' },
        ]}
      />,
    )
    const out = lastFrame() ?? ''
    const lines = out.split('\n').filter((l) => l.trim().length > 0)
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines[0]).toContain('model')
    expect(lines[1]).toContain('permission')
  })
})

describe('Tabs', () => {
  test('marks the active item with brackets', () => {
    const { lastFrame } = render(<Tabs items={['Account', 'Config', 'Usage']} active={1} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('[ Config ]')
    expect(out).toContain('Account')
    expect(out).toContain('Usage')
  })
})
