import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { ModelPickerCard, MODEL_CATALOG, type ModelPickScope } from '../../src/tui/components/ModelPickerCard'

describe('ModelPickerCard', () => {
  test('aligns the provider column across rows with differing label widths', () => {
    const { lastFrame } = render(
      <ModelPickerCard current={MODEL_CATALOG[0]!.id} onPick={() => {}} onCancel={() => {}} />,
    )
    const out = lastFrame() ?? ''
    const providerColumns = MODEL_CATALOG.map((m) => {
      const line = out.split('\n').find((l) => l.includes(m.label))
      expect(line, `expected a line containing ${m.label}`).toBeDefined()
      return line!.indexOf(m.provider)
    })
    const first = providerColumns[0]!
    for (const col of providerColumns) expect(col).toBe(first)
  })

  test('renders every catalog model on its own line', () => {
    const { lastFrame } = render(
      <ModelPickerCard current={MODEL_CATALOG[0]!.id} onPick={() => {}} onCancel={() => {}} />,
    )
    const out = lastFrame() ?? ''
    for (const m of MODEL_CATALOG) {
      expect(out).toContain(m.label)
      expect(out).toContain(m.provider)
    }
  })

  test('renders default vs session-only footer hints', () => {
    const { lastFrame } = render(
      <ModelPickerCard current={MODEL_CATALOG[0]!.id} onPick={() => {}} onCancel={() => {}} />,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('Enter default')
    expect(out).toContain('s session-only')
  })

  test('Enter picks the highlighted model as the default', async () => {
    let picked: { id: string; scope: ModelPickScope } | null = null
    const { stdin } = render(
      <ModelPickerCard
        current={MODEL_CATALOG[0]!.id}
        onPick={(id, scope) => {
          picked = { id, scope }
        }}
        onCancel={() => {}}
      />,
    )

    stdin.write('\x1b[B')
    await new Promise((resolve) => setTimeout(resolve, 10))
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(picked).toEqual({ id: MODEL_CATALOG[1]!.id, scope: 'default' })
  })

  test('s picks the highlighted model for this session only', async () => {
    let picked: { id: string; scope: ModelPickScope } | null = null
    const { stdin } = render(
      <ModelPickerCard
        current={MODEL_CATALOG[0]!.id}
        onPick={(id, scope) => {
          picked = { id, scope }
        }}
        onCancel={() => {}}
      />,
    )

    stdin.write('\x1b[B')
    await new Promise((resolve) => setTimeout(resolve, 10))
    stdin.write('s')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(picked).toEqual({ id: MODEL_CATALOG[1]!.id, scope: 'session' })
  })
})
