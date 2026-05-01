import { describe, expect, test } from 'bun:test'
import { LOADING_VERBS, pickVerb } from '../src/tui/components/loading-verbs'

describe('pickVerb', () => {
  test('returns a verb from the configured pool', () => {
    const verb = pickVerb()
    expect(LOADING_VERBS.includes(verb as (typeof LOADING_VERBS)[number])).toBe(true)
  })

  test('selection is driven by the injected rng so callers can pin it', () => {
    expect(pickVerb(() => 0)).toBe(LOADING_VERBS[0])
    expect(pickVerb(() => 0.999)).toBe(LOADING_VERBS[LOADING_VERBS.length - 1])
  })

  test('every verb is at least 4 characters and present continuous-shaped', () => {
    for (const v of LOADING_VERBS) {
      expect(v.length).toBeGreaterThanOrEqual(4)
      expect(v.endsWith('ing')).toBe(true)
    }
  })
})
