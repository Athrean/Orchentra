import { describe, expect, test } from 'bun:test'
import {
  COMPLETION_VERBS_LIST,
  LOADING_VERBS,
  completionVerbForId,
  pickVerb,
} from '../src/tui/components/loading-verbs'

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

describe('completionVerbForId', () => {
  test('returns a verb from the completion pool', () => {
    const verb = completionVerbForId('row-1')
    expect(COMPLETION_VERBS_LIST.includes(verb as (typeof COMPLETION_VERBS_LIST)[number])).toBe(true)
  })

  test('is deterministic for a given id (no flicker across re-renders)', () => {
    expect(completionVerbForId('abc')).toBe(completionVerbForId('abc'))
  })
})
