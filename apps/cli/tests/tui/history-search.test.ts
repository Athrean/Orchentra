import { describe, expect, test } from 'bun:test'
import { findAdjacentMatch, findLatestMatch } from '../../src/tui/input/history-search'

const HISTORY = ['git status', 'npm test', 'git commit -m wip', 'ls -la', 'git push']

describe('findLatestMatch', () => {
  test('empty query matches nothing', () => {
    expect(findLatestMatch(HISTORY, '')).toBeNull()
  })

  test('returns the newest (highest-index) entry containing the query', () => {
    // 'git' appears at 0, 2, 4 → newest is 4.
    expect(findLatestMatch(HISTORY, 'git')).toBe(4)
  })

  test('is case-insensitive', () => {
    expect(findLatestMatch(HISTORY, 'GIT COMMIT')).toBe(2)
  })

  test('null when nothing matches', () => {
    expect(findLatestMatch(HISTORY, 'docker')).toBeNull()
  })
})

describe('findAdjacentMatch', () => {
  test('older steps to the next lower matching index', () => {
    expect(findAdjacentMatch(HISTORY, 'git', 4, 'older')).toBe(2)
    expect(findAdjacentMatch(HISTORY, 'git', 2, 'older')).toBe(0)
  })

  test('newer steps to the next higher matching index', () => {
    expect(findAdjacentMatch(HISTORY, 'git', 0, 'newer')).toBe(2)
    expect(findAdjacentMatch(HISTORY, 'git', 2, 'newer')).toBe(4)
  })

  test('parks on the current match when there is no further hit', () => {
    expect(findAdjacentMatch(HISTORY, 'git', 0, 'older')).toBe(0)
    expect(findAdjacentMatch(HISTORY, 'git', 4, 'newer')).toBe(4)
  })

  test('empty query is a no-op', () => {
    expect(findAdjacentMatch(HISTORY, '', 3, 'older')).toBe(3)
  })
})
