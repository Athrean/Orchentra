import { describe, expect, test } from 'bun:test'
import { fuzzyScore } from '../../src/tui/suggestions/fuzzy'

describe('fuzzyScore', () => {
  test('empty query is a zero-score match', () => {
    expect(fuzzyScore('', 'anything')?.score).toBe(0)
  })

  test('non-subsequence returns null', () => {
    expect(fuzzyScore('xyz', 'help')).toBeNull()
  })

  test('prefix match scores higher than mid-string match', () => {
    const prefix = fuzzyScore('he', 'help')
    const mid = fuzzyScore('he', 'unhe')
    expect(prefix).not.toBeNull()
    expect(mid).not.toBeNull()
    expect(prefix!.score).toBeGreaterThan(mid!.score)
  })

  test('consecutive matches beat scattered matches', () => {
    const consecutive = fuzzyScore('abc', 'abcdef')
    const scattered = fuzzyScore('abc', 'aXbXcXdef')
    expect(consecutive!.score).toBeGreaterThan(scattered!.score)
  })

  test('separator boundaries get a bonus', () => {
    const boundary = fuzzyScore('rt', 'run-tests')
    const inline = fuzzyScore('rt', 'restart')
    expect(boundary!.score).toBeGreaterThan(inline!.score)
  })

  test('case insensitive', () => {
    expect(fuzzyScore('HE', 'help')).not.toBeNull()
    expect(fuzzyScore('he', 'HELP')).not.toBeNull()
  })
})
