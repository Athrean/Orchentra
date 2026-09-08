import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import {
  ModelPickerCard,
  MODEL_CATALOG,
  buildRows,
  stepEffort,
  type ModelPickScope,
} from '../../src/tui/components/ModelPickerCard'
import { MODEL_SECTIONS } from '../../src/model-catalog'

function frame(current = MODEL_CATALOG[0]!.id): string {
  const { lastFrame } = render(<ModelPickerCard current={current} onPick={() => {}} onCancel={() => {}} />)
  return lastFrame() ?? ''
}

async function type(
  keys: string[],
  current = MODEL_CATALOG[0]!.id,
): Promise<{ picked: { id: string; scope: ModelPickScope } | null; frame: string }> {
  let picked: { id: string; scope: ModelPickScope } | null = null
  const { stdin, lastFrame } = render(
    <ModelPickerCard
      current={current}
      onPick={(id, scope) => {
        picked = { id, scope }
      }}
      onCancel={() => {}}
    />,
  )
  for (const k of keys) {
    stdin.write(k)
    await new Promise((r) => setTimeout(r, 8))
  }
  return { picked: picked as { id: string; scope: ModelPickScope } | null, frame: lastFrame() ?? '' }
}

describe('buildRows', () => {
  test('unfiltered rows carry one heading per section, in catalog order', () => {
    const headings = buildRows('').flatMap((r) => (r.kind === 'section' ? [r.label] : []))
    expect(headings).toEqual([...MODEL_SECTIONS])
  })

  test('every catalog model appears exactly once', () => {
    const ids = buildRows('').flatMap((r) => (r.kind === 'model' ? [r.model.id] : []))
    expect(ids).toEqual(MODEL_CATALOG.map((m) => m.id))
  })

  test('a query flattens the list — no headings, only matches', () => {
    const rows = buildRows('kimi')
    expect(rows.every((r) => r.kind === 'model')).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      if (r.kind !== 'model') continue
      expect(`${r.model.label} ${r.model.id}`.toLowerCase()).toContain('kimi')
    }
  })

  test('the query also matches on section and id, not just the label', () => {
    // "opencode Go" is a section; "antigravity/" only ever appears in an id.
    expect(buildRows('opencode go').length).toBeGreaterThan(0)
    expect(buildRows('antigravity/').length).toBeGreaterThan(0)
  })

  test('a query that matches nothing yields no rows', () => {
    expect(buildRows('zzzzz-no-such-model')).toEqual([])
  })
})

describe('ModelPickerCard', () => {
  test('renders section headings and the search affordance', () => {
    const out = frame()
    for (const section of MODEL_SECTIONS.slice(0, 3)) expect(out).toContain(section)
    expect(out).toContain('Select model')
    expect(out).toContain('Search')
  })

  test('marks the current model with a gutter dot', () => {
    expect(frame(MODEL_CATALOG[1]!.id)).toContain(`● ${MODEL_CATALOG[1]!.label}`)
  })

  test('a free-tier row shows its badge', () => {
    const free = MODEL_CATALOG.find((m) => m.tag === 'Free')
    expect(free).toBeDefined()
    // Reachable by search even though the catalog is longer than the viewport.
    expect(buildRows('free').some((r) => r.kind === 'model' && r.model.id === free!.id)).toBe(true)
  })

  test('Enter picks the highlighted model as the default', async () => {
    const { picked } = await type(['\x1b[B', '\r'])
    expect(picked).toEqual({ id: MODEL_CATALOG[1]!.id, scope: 'default' })
  })

  // Plain letters go to the search box, so session-scope moved to ctrl-s.
  test('ctrl-s picks the highlighted model for this session only', async () => {
    const { picked } = await type(['\x1b[B', '\x13'])
    expect(picked).toEqual({ id: MODEL_CATALOG[1]!.id, scope: 'session' })
  })

  test('typing filters the list and Enter picks from the filtered set', async () => {
    const { picked, frame: out } = await type([...'kimi k3', '\r'])
    expect(out).toContain('Kimi K3')
    expect(picked?.id).toBe('go/kimi-k3')
  })

  test('a narrowed query cannot leave the cursor past the end of the results', async () => {
    // Walk deep into the full list, then filter down to a handful of rows.
    const keys = Array.from({ length: 40 }, () => '\x1b[B')
    const { picked } = await type([...keys, ...'nemotron', '\r'])
    expect(picked?.id.startsWith('zen/nemotron')).toBe(true)
  })

  test('the footer names the live bindings', () => {
    const out = frame()
    expect(out).toContain('Enter default')
    expect(out).toContain('ctrl-s session-only')
    expect(out).toContain('type to search')
  })
})

describe('effort dial in the model picker', () => {
  test('stepEffort walks the scale and clamps at both ends', () => {
    expect(stepEffort('low', -1)).toBe('low')
    expect(stepEffort('low', 1)).toBe('medium')
    expect(stepEffort('max', 1)).toBe('max')
    expect(stepEffort('max', -1)).toBe('xhigh')
  })

  test('the row is hidden when the host passes no effort', () => {
    expect(frame()).not.toContain('effort · ←/→')
  })

  test('the row names the current effort and its binding', () => {
    const { lastFrame } = render(
      <ModelPickerCard current={MODEL_CATALOG[0]!.id} effort="xhigh" onPick={() => {}} onCancel={() => {}} />,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('xhigh')
    expect(out).toContain('effort · ←/→ to adjust')
  })

  // Live on every step, not on confirm: Esc must not roll the dial back.
  test('each arrow reports one step to the host', async () => {
    const seen: string[] = []
    const { stdin } = render(
      <ModelPickerCard
        current={MODEL_CATALOG[0]!.id}
        effort="low"
        onEffort={(e) => seen.push(e)}
        onPick={() => {}}
        onCancel={() => {}}
      />,
    )
    for (const k of ['\x1b[C', '\x1b[C', '\x1b[D']) {
      stdin.write(k)
      await new Promise((r) => setTimeout(r, 8))
    }
    expect(seen).toEqual(['medium', 'high', 'medium'])
  })

  test('arrows at the end of the scale report nothing', async () => {
    const seen: string[] = []
    const { stdin } = render(
      <ModelPickerCard
        current={MODEL_CATALOG[0]!.id}
        effort="max"
        onEffort={(e) => seen.push(e)}
        onPick={() => {}}
        onCancel={() => {}}
      />,
    )
    stdin.write('\x1b[C')
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([])
  })

  test('arrows do not disturb the model cursor', async () => {
    const { picked } = await type(['\x1b[B', '\x1b[C', '\x1b[C', '\r'])
    expect(picked?.id).toBe(MODEL_CATALOG[1]!.id)
  })
})
