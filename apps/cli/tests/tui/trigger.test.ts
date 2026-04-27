import { describe, expect, test } from 'bun:test'
import { detectTrigger } from '../../src/tui/suggestions/trigger'

describe('detectTrigger', () => {
  test('slash only triggers at column 0', () => {
    expect(detectTrigger('/he', 3)).toEqual({ trigger: '/', anchorStart: 0, query: 'he' })
    expect(detectTrigger(' /he', 4)).toBeNull()
    expect(detectTrigger('hi /he', 6)).toBeNull()
  })

  test('@ triggers after whitespace and at start', () => {
    expect(detectTrigger('@src', 4)).toEqual({ trigger: '@', anchorStart: 0, query: 'src' })
    expect(detectTrigger('see @src', 8)).toEqual({ trigger: '@', anchorStart: 4, query: 'src' })
    expect(detectTrigger('foo@bar', 7)).toBeNull()
  })

  test('! triggers after whitespace and at start', () => {
    expect(detectTrigger('!ls', 3)).toEqual({ trigger: '!', anchorStart: 0, query: 'ls' })
    expect(detectTrigger('run !ls', 7)).toEqual({ trigger: '!', anchorStart: 4, query: 'ls' })
    expect(detectTrigger('a!b', 3)).toBeNull()
  })

  test('whitespace inside the token kills the trigger', () => {
    expect(detectTrigger('@src core', 9)).toBeNull()
  })

  test('cursor in the middle returns prefix only', () => {
    expect(detectTrigger('/help me', 3)).toEqual({ trigger: '/', anchorStart: 0, query: 'he' })
  })
})
