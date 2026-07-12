import { describe, expect, test } from 'bun:test'
import { planSlices, parallelWaves, type Slice } from '../src/composites/slices'
import type { ArchitectPlan } from '../src/composites/architect'

function plan(scaffold: { path: string; purpose: string }[]): ArchitectPlan {
  return {
    recommendedStack: 's',
    rationale: 'r',
    alternatives: [],
    architecture: 'a',
    scaffold,
    verification: [],
    model: 'm',
    tokensIn: 0,
    tokensOut: 0,
  }
}

function slice(id: string, files: string[], dependsOn: string[] = []): Slice {
  return { id, title: id, intent: id, files, dependsOn }
}

describe('planSlices', () => {
  test('makes one slice per scaffold file entry, carrying file + intent', () => {
    const slices = planSlices(
      plan([
        { path: 'src/a.ts', purpose: 'thing a' },
        { path: 'src/b.ts', purpose: 'thing b' },
      ]),
    )

    expect(slices).toHaveLength(2)
    expect(slices[0].files).toEqual(['src/a.ts'])
    expect(slices[0].intent).toBe('thing a')
  })

  test('drops directory entries (trailing slash)', () => {
    const slices = planSlices(
      plan([
        { path: 'packages/widget/', purpose: 'a dir' },
        { path: 'src/a.ts', purpose: 'a file' },
      ]),
    )

    expect(slices.map((s) => s.id)).toEqual(['src/a.ts'])
  })

  test('returns no slices for an empty scaffold', () => {
    expect(planSlices(plan([]))).toEqual([])
  })
})

describe('parallelWaves', () => {
  test('puts file-disjoint, dependency-free slices in a single wave', () => {
    const waves = parallelWaves([slice('a', ['src/a.ts']), slice('b', ['src/b.ts'])])

    expect(waves).toHaveLength(1)
    expect(waves[0].map((s) => s.id)).toEqual(['a', 'b'])
  })

  test('splits slices that share a file across separate waves', () => {
    const waves = parallelWaves([slice('a', ['src/shared.ts']), slice('b', ['src/shared.ts'])])

    expect(waves).toHaveLength(2)
    expect(waves[0][0].id).toBe('a')
    expect(waves[1][0].id).toBe('b')
  })

  test('runs a dependent slice in a later wave than its dependency', () => {
    const waves = parallelWaves([slice('b', ['src/b.ts'], ['a']), slice('a', ['src/a.ts'])])

    expect(waves[0].map((s) => s.id)).toEqual(['a'])
    expect(waves[1].map((s) => s.id)).toEqual(['b'])
  })

  test('does not loop forever on an unsatisfiable dependency', () => {
    const waves = parallelWaves([slice('b', ['src/b.ts'], ['missing'])])

    expect(waves.flat().map((s) => s.id)).toEqual(['b'])
  })
})
