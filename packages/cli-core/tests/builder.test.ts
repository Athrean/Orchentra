import { test, expect, describe } from 'bun:test'
import { buildPatternText, buildResolutionText } from '../src/memory/builder'

describe('buildPatternText', () => {
  test('includes required fields', () => {
    // given — input with only required fields
    // when — building pattern text
    const text = buildPatternText({
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'timeout',
    })

    // then — output contains all required fields
    expect(text).toContain('workflow: ci')
    expect(text).toContain('branch: main')
    expect(text).toContain('root_cause: timeout')
  })

  test('omits optional fields when not provided', () => {
    // given — input without optional fields
    // when — building pattern text
    const text = buildPatternText({
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'timeout',
    })

    // then — output does not contain optional field labels
    expect(text).not.toContain('summary:')
    expect(text).not.toContain('failure_type:')
  })

  test('includes optional fields when provided', () => {
    // given — input with optional fields
    // when — building pattern text
    const text = buildPatternText({
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'timeout',
      summary: 'tests flaked',
      failureType: 'flaky_test',
    })

    // then — output contains optional fields
    expect(text).toContain('summary: tests flaked')
    expect(text).toContain('failure_type: flaky_test')
  })
})

describe('buildResolutionText', () => {
  test('returns provided fix', () => {
    // given — a resolution string
    // when — building resolution text
    // then — returns the string as-is
    expect(buildResolutionText('increase timeout')).toBe('increase timeout')
  })

  test('returns fallback when undefined', () => {
    // given — no resolution
    // when — building resolution text
    // then — returns fallback
    expect(buildResolutionText(undefined)).toBe('No resolution recorded')
  })
})
